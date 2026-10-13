"""Generate private configuration at runtime; never embed credentials in an image."""
import configparser
import os
from pathlib import Path
import re
import sys


def runtime_options(environment):
    database = environment.get('ODOO_DATABASE', '')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}', database):
        raise ValueError('ODOO_DATABASE must be a single SQL database name')
    if database == 'lumio_demo':
        raise ValueError('The production image refuses the local demo database')
    master = environment.get('ODOO_MASTER_PASSWORD', '')
    password = environment.get('PASSWORD', '')
    if any(len(value) < 24 or '\n' in value or '\r' in value or value != value.strip() for value in (master, password)):
        raise ValueError('Configure distinct Odoo master and database passwords of at least 24 characters')
    if master == password:
        raise ValueError('Odoo master and database passwords must be different')
    user = environment.get('USER', '')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}', user):
        raise ValueError('USER must identify the dedicated PostgreSQL application role')
    result = {
        'admin_passwd': master, 'db_host': environment.get('HOST', 'odoo-db'),
        'db_port': '5432', 'db_user': user, 'db_password': password,
        'db_name': database, 'dbfilter': '^' + re.escape(database) + '$',
        'list_db': 'False', 'proxy_mode': 'True',
        'data_dir': '/var/lib/odoo',
        'addons_path': '/usr/lib/python3/dist-packages/odoo/addons,/mnt/lumio-addons',
        'http_port': '8069', 'gevent_port': '8072', 'log_level': 'warn',
    }
    for variable, option, minimum, maximum, default in (
        ('ODOO_WORKERS', 'workers', 1, 64, 2),
        ('ODOO_CRON_THREADS', 'max_cron_threads', 1, 16, 1),
        ('ODOO_WORKER_MEMORY_SOFT', 'limit_memory_soft', 134217728, 17179869184, 536870912),
        ('ODOO_WORKER_MEMORY_HARD', 'limit_memory_hard', 134217728, 17179869184, 805306368),
    ):
        value = environment.get(variable, str(default))
        if not re.fullmatch(r'[0-9]+', value) or not minimum <= int(value) <= maximum:
            raise ValueError(f'{variable} is outside its supported range')
        result[option] = value
    if int(result['limit_memory_hard']) <= int(result['limit_memory_soft']):
        raise ValueError('ODOO_WORKER_MEMORY_HARD must exceed ODOO_WORKER_MEMORY_SOFT')
    return result


def main():
    try:
        options = runtime_options(os.environ)
    except ValueError as error:
        raise SystemExit('Odoo production configuration error: ' + str(error)) from None
    # Disable interpolation so secrets containing '%' remain literal.
    config = configparser.ConfigParser(interpolation=None)
    config['options'] = options
    path = Path(os.environ['ODOO_RC'])
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as file:
        config.write(file)
    os.chmod(path, 0o600)
    os.execv('/entrypoint.sh', ['/entrypoint.sh', *(sys.argv[1:] or ['odoo'])])


if __name__ == '__main__':
    main()
