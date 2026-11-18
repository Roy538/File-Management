"""
Loads demo registry content (departments, paper files, loans, a missing file, a request) into a
LOCAL dev backend through the public API only. Run after seed-demo.py; run once (re-running
skips files whose numbers already exist).
Usage:  python scripts/seed-records.py [http://localhost:8080]
"""
import datetime
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080') + '/api/v1'
ORG, ADMIN, PW = 'MC', 'admin@manageedocs.local', 'ChangeMe-Dev-2026!'
DEMO_PW = 'Demo-Password-2026!'


def call(method, path, token, body=None, ok_conflict=False):
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer ' + token} if token else {'Accept': 'application/json'}
    data = None
    if body is not None:
        data, headers['Content-Type'] = json.dumps(body).encode(), 'application/json'
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}').get('data')
    except urllib.error.HTTPError as e:
        if ok_conflict and e.code == 409:
            return None
        raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode()[:300]}')


def login(email, password):
    return call('POST', '/auth/login', None, {'organisation': ORG, 'email': email, 'password': password})['accessToken']


admin = login(ADMIN, PW)
grace = login('grace.wanjiru@mycredit.test', DEMO_PW)
peter = login('peter.otieno@mycredit.test', DEMO_PW)
amina = login('amina.hassan@mycredit.test', DEMO_PW)

depts = {d['code']: d['id'] for d in call('GET', '/departments', admin)}
for code, name in [('CRD', 'Credit'), ('LGL', 'Legal'), ('OPS', 'Operations'), ('WLD', 'Westlands Branch')]:
    if code not in depts:
        depts[code] = call('POST', '/departments', admin, {'code': code, 'name': name})['id']

today = datetime.date.today()
FILES = [
    ('LN/2024/0117', 'Jane Wambui', 'CRD', 'Cabinet 1, drawer 2'),
    ('LN/2024/0342', 'Samuel Kiprono', 'CRD', 'Cabinet 1, drawer 3'),
    ('LN/2025/0058', 'Faith Chebet', 'CRD', 'Cabinet 2, drawer 1'),
    ('LN/2025/0211', 'Daniel Mwangi', 'WLD', 'Westlands strongroom, shelf B'),
    ('LN/2025/0476', 'Esther Akinyi', 'WLD', 'Westlands strongroom, shelf C'),
    ('LG/2023/0009', 'Mutua Holdings Ltd', 'LGL', 'Legal cabinet, drawer 1'),
    ('LG/2025/0031', 'Otieno & Sons', 'LGL', 'Legal cabinet, drawer 2'),
    ('OP/2025/0104', 'Kamau Transporters', 'OPS', 'Cabinet 5, drawer 1'),
    ('OP/2026/0012', 'Njeri Wholesalers', 'OPS', 'Cabinet 5, drawer 2'),
    ('LN/2026/0003', 'Halima Yusuf', 'CRD', 'Cabinet 2, drawer 4'),
]
ids = {}
for i, (num, customer, dept, shelf) in enumerate(FILES):
    f = call('POST', '/records/files', grace, {
        'fileNumber': num, 'customerName': customer, 'departmentId': depts[dept],
        'dateOpened': str(today - datetime.timedelta(days=400 - i * 30)), 'homeLocation': shelf,
    }, ok_conflict=True)
    if f:
        ids[num] = f['id']

if len(ids) < len(FILES):
    print(f'Registered {len(ids)} new files (others already existed); skipping loans to avoid duplicates.')
    sys.exit(0)

lend = lambda num, who, dept, days, by=grace: call('POST', f'/records/files/{ids[num]}/dispatch', by, {
    'dispatchedTo': who, 'department': dept, 'reason': 'Loan review', 'expectedReturnOn': str(today + datetime.timedelta(days=days))})
lend('LN/2024/0117', 'Mary Achieng', 'Credit', 3)
lend('LN/2025/0211', 'Brian Odhiambo', 'Westlands Branch', 0, peter)
lend('LG/2023/0009', 'Ruth Wairimu', 'Legal', 7)

# A completed loan (returned to the wrong drawer), then put back on its shelf.
lend('OP/2025/0104', 'Kevin Mutai', 'Operations', 2)
call('POST', f'/records/files/{ids["OP/2025/0104"]}/return', grace, {
    'returnedByName': 'Kevin Mutai', 'condition': 'WORN', 'returnedToCorrectLocation': False, 'location': 'Cabinet 5, drawer 3'})
call('POST', f'/records/files/{ids["OP/2025/0104"]}/status', grace, {'action': 'SHELVE', 'location': 'Cabinet 5, drawer 1'})

# One back from loan but not yet shelved, one missing, one archived.
lend('LN/2025/0058', 'Mary Achieng', 'Credit', 1)
call('POST', f'/records/files/{ids["LN/2025/0058"]}/return', peter, {'returnedByName': 'Mary Achieng', 'condition': 'GOOD', 'returnedToCorrectLocation': True})
call('POST', f'/records/files/{ids["LN/2024/0342"]}/status', grace, {'action': 'FLAG_MISSING', 'notes': 'Not in drawer 3 during the quarterly check'})
call('POST', f'/records/files/{ids["LG/2025/0031"]}/status', grace, {'action': 'ARCHIVE', 'notes': 'Matter closed'})

# Amina (a department user) asks for two files: one on the shelf, one currently out.
call('POST', '/records/requests', amina, {'fileId': ids['LN/2026/0003'], 'department': 'Credit', 'purpose': 'Top-up application',
                                         'neededBy': str(today + datetime.timedelta(days=2))})
call('POST', '/records/requests', amina, {'fileId': ids['LN/2024/0117'], 'department': 'Credit', 'purpose': 'Statement query'})
print(f'Registry seeded: {len(ids)} files, {len(depts)} departments, 4 loans out or back, 2 requests.')
