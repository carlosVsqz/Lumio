"""Private, atomic integration settings; contains no Odoo/domain model imports."""
import os
from pathlib import Path
import re
import tempfile


def select_id(records, configured, label):
    if configured:
        if not re.fullmatch(r'[1-9][0-9]*', configured):
            raise ValueError(f'{label} must be a positive existing ID')
        matches = [record for record in records if record['id'] == int(configured)]
    else:
        matches = records
    if len(matches) != 1:
        raise ValueError(f'{label}: select one existing record explicitly when multiple records exist')
    return matches[0]['id']


def read_settings(path):
    if not Path(path).exists():
        return {}
    return dict(line.split('=', 1) for line in Path(path).read_text().splitlines() if '=' in line and not line.startswith('#'))


def write_settings(path, settings):
    keys = ['ODOO_API_KEY', 'ODOO_WEBSITE_ID', 'ODOO_PRICELIST_ID', 'ODOO_WAREHOUSE_ID']
    for key in keys:
        value = str(settings.get(key, ''))
        if not value or any(char in value for char in '\n\r\0'):
            raise ValueError(f'Missing or invalid {key}; private settings were not changed')
        if key != 'ODOO_API_KEY' and not re.fullmatch(r'[1-9][0-9]*', value):
            raise ValueError(f'Invalid {key}; private settings were not changed')
    content = ''.join(f'{key}={settings[key]}\n' for key in keys)
    target = Path(path)
    if target.exists() and target.read_text() == content:
        return False
    descriptor, temporary = tempfile.mkstemp(prefix='.catalog-', dir=target.parent)
    try:
        with os.fdopen(descriptor, 'w') as file:
            os.fchmod(file.fileno(), 0o640)
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True
