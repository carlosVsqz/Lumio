import os
from pathlib import Path
import stat
import tempfile
import unittest
from bootstrap_state import SIGNALING_COLUMNS, SIGNALING_TABLES, needs_initialization, read_settings, select_id, write_settings


class BootstrapStateTest(unittest.TestCase):
    def test_accepts_empty_database_and_odoo19_signaling_only_state(self):
        self.assertTrue(needs_initialization([], {}))
        columns = {table:list(SIGNALING_COLUMNS) for table in SIGNALING_TABLES}
        self.assertTrue(needs_initialization(SIGNALING_TABLES, columns))
        self.assertTrue(needs_initialization(['orm_signaling_registry'], columns))
        self.assertFalse(needs_initialization(['ir_module_module', 'product_template'], {}))

    def test_refuses_business_tables_and_unknown_signaling_tables(self):
        for tables in [['orders'], [*SIGNALING_TABLES, 'orders'], ['orm_signaling_custom']]:
            with self.subTest(tables=tables), self.assertRaisesRegex(ValueError, 'no data were changed'):
                needs_initialization(tables, {table:list(SIGNALING_COLUMNS) for table in tables})

    def test_refuses_signaling_names_with_unexpected_or_missing_columns(self):
        for columns in [[], [('id', 'text', 'NO'), SIGNALING_COLUMNS[1]],
                        [*SIGNALING_COLUMNS, ('customer', 'text', 'YES')]]:
            with self.subTest(columns=columns), self.assertRaisesRegex(ValueError, 'structure'):
                needs_initialization(['orm_signaling_registry'], {'orm_signaling_registry':columns})
        with self.assertRaises(ValueError):
            needs_initialization(['orm_signaling_registry'], {})

    def test_discovers_only_unique_records_and_reuses_explicit_ids(self):
        self.assertEqual(select_id([{'id':7}], '', 'website'), 7)
        self.assertEqual(select_id([{'id':7},{'id':9}], '9', 'warehouse'), 9)
        for records, value in [([], ''), ([{'id':7},{'id':9}], ''), ([{'id':7}], '9'), ([{'id':7}], '0'), ([{'id':7}], 'abc')]:
            with self.assertRaises(ValueError):
                select_id(records, value, 'reference')

    def test_private_settings_are_atomic_and_preserved_when_unchanged(self):
        with tempfile.TemporaryDirectory(prefix='lumio-settings-test-') as directory:
            path = Path(directory) / 'catalog.properties'
            settings = {'ODOO_API_KEY':'synthetic-private-key', 'ODOO_WEBSITE_ID':1, 'ODOO_PRICELIST_ID':4, 'ODOO_WAREHOUSE_ID':2}
            self.assertTrue(write_settings(path, settings))
            before = path.stat().st_mtime_ns
            self.assertFalse(write_settings(path, settings))
            self.assertEqual(path.stat().st_mtime_ns, before)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertEqual(read_settings(path)['ODOO_API_KEY'], settings['ODOO_API_KEY'])
            with self.assertRaises(ValueError):
                write_settings(path, {**settings, 'ODOO_PRICELIST_ID':0})
            self.assertEqual(read_settings(path)['ODOO_PRICELIST_ID'], '4')
            self.assertEqual([file.name for file in Path(directory).iterdir()], ['catalog.properties'])
