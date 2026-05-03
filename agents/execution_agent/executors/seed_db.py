# run as: python seed_db.py
import sqlite3, pathlib

db = pathlib.Path("data/office.db")
db.parent.mkdir(exist_ok=True)

con = sqlite3.connect(db)
con.executescript("""
CREATE TABLE IF NOT EXISTS hr_leave_balances (
    employee_name   TEXT,
    leave_type      TEXT,
    total_entitlement INTEGER,
    used_days       INTEGER,
    remaining_days  INTEGER,
    policy_note     TEXT
);

CREATE TABLE IF NOT EXISTS routing_table (
    department      TEXT,
    priority_label  TEXT,
    reviewer_name   TEXT,
    reviewer_email  TEXT
);

INSERT INTO hr_leave_balances VALUES
    ('Ali Abdallah', 'annual', 21, 7, 14, 'Unused days above 5 cannot be carried to next year'),
    ('Sara Hassan',  'annual', 21, 3, 18, 'Unused days above 5 cannot be carried to next year'),
    ('Ali Abdallah', 'sick',   10, 2,  8, 'Requires medical certificate after 3 consecutive days');

INSERT INTO routing_table VALUES
    ('HR',      'medium', 'Dr. Mona Khalil', 'mona.khalil@company.com'),
    ('HR',      'high',   'Dr. Mona Khalil', 'mona.khalil@company.com'),
    ('IT',      'medium', 'Ismail Hesham',   'ismail.hesham@company.com'),
    ('Finance', 'medium', 'Karim Mostafa',   'karim.mostafa@company.com');
""")
con.commit()
con.close()
print("Seeded data/office.db")