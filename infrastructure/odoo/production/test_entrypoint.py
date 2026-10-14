import unittest
from entrypoint import runtime_options


class ProductionConfigurationTest(unittest.TestCase):
    def environment(self):
        return {'ODOO_DATABASE':'mi_tienda_prod', 'USER':'lumio_odoo', 'HOST':'odoo-db',
                'PASSWORD':'synthetic-database-secret-0001', 'ODOO_MASTER_PASSWORD':'synthetic-master-secret-0002'}

    def test_limits_database_and_enables_proxy_and_workers(self):
        options = runtime_options(self.environment())
        self.assertEqual(options['db_name'], 'mi_tienda_prod')
        self.assertEqual(options['dbfilter'], '^mi_tienda_prod$')
        self.assertEqual(options['list_db'], 'False')
        self.assertEqual(options['proxy_mode'], 'True')
        self.assertEqual(options['workers'], '2')
        self.assertEqual(options['gevent_port'], '8072')
        self.assertEqual(options['http_interface'], '0.0.0.0')

    def test_refuses_demo_and_multiple_database_selection(self):
        for database in ['lumio_demo', 'foo,bar', 'foo.*', '', 'bad\nname']:
            with self.subTest(database=database), self.assertRaises(ValueError):
                runtime_options({**self.environment(), 'ODOO_DATABASE':database})

    def test_requires_distinct_nondefault_secrets_without_disclosing_them(self):
        for patch in [{'PASSWORD':''}, {'ODOO_MASTER_PASSWORD':'admin'},
                      {'ODOO_MASTER_PASSWORD':self.environment()['PASSWORD']}, {'PASSWORD':'secret-value-with\na-newline'}]:
            with self.assertRaises(ValueError) as caught:
                runtime_options({**self.environment(), **patch})
            self.assertNotIn('synthetic-', str(caught.exception))
            self.assertNotIn('secret-value', str(caught.exception))

    def test_validates_worker_ranges_and_memory_relationship(self):
        for patch in [{'ODOO_WORKERS':'0'}, {'ODOO_WORKERS':'-1'}, {'ODOO_CRON_THREADS':'bad'},
                      {'ODOO_WORKER_MEMORY_SOFT':'805306368', 'ODOO_WORKER_MEMORY_HARD':'536870912'}]:
            with self.assertRaises(ValueError):
                runtime_options({**self.environment(), **patch})


if __name__ == '__main__':
    unittest.main()
