"""
Loads demo content into a LOCAL dev backend through the public API only (no database access):
users, cabinets, folders, sub-dividers, a document type with metadata, real text PDFs, a review.
Usage:  python scripts/seed-demo.py [http://localhost:8080]
Idempotency: run once against a fresh dev database (re-running creates duplicates of documents).
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080') + '/api/v1'
ORG, ADMIN, PW = 'MC', 'admin@manageedocs.local', 'ChangeMe-Dev-2026!'
DEMO_PW = 'Demo-Password-2026!'


def call(method, path, token=None, body=None, raw=None, content_type=None):
    data, headers = None, {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        data, headers['Content-Type'] = json.dumps(body).encode(), 'application/json'
    if raw is not None:
        data, headers['Content-Type'] = raw, content_type
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}').get('data')
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode()[:300]}')


def login(email, password=PW):
    return call('POST', '/auth/login', body={'organisation': ORG, 'email': email, 'password': password})['accessToken']


def pdf(lines):
    """A minimal valid single-page PDF with real text (extractable by Tika)."""
    text = 'BT /F1 12 Tf 72 720 Td 16 TL ' + ' '.join(
        '(' + l.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ") '" for l in lines) + ' ET'
    objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        f'<< /Length {len(text)} >>\nstream\n{text}\nendstream',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out, offsets = b'%PDF-1.7\n', []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n{o}\nendobj\n'.encode('latin-1')
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode()
    out += b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return out


def upload(token, folder, name, data, sub=None, doc_type=None, metadata=None):
    boundary = uuid.uuid4().hex
    parts = []

    def field(n, v):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode())

    field('folderId', folder)
    if sub:
        field('subDividerId', sub)
    if doc_type:
        field('documentTypeId', doc_type)
    if metadata:
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n'
                      f'Content-Type: application/json\r\n\r\n{json.dumps(metadata)}\r\n').encode())
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                  f'Content-Type: application/octet-stream\r\n\r\n').encode() + data + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return call('POST', '/documents', token, raw=b''.join(parts),
                content_type=f'multipart/form-data; boundary={boundary}')['document']['id']


admin = login(ADMIN)
users = {}
for email, first, last, role in [
    ('grace.wanjiru@mycredit.test', 'Grace', 'Wanjiru', 'OFFICER'),
    ('peter.otieno@mycredit.test', 'Peter', 'Otieno', 'OFFICER'),
    ('amina.hassan@mycredit.test', 'Amina', 'Hassan', 'DEPT_USER'),
    ('john.kamau@mycredit.test', 'John', 'Kamau', 'DEPT_USER'),
]:
    users[email] = call('POST', '/users', admin, {'email': email, 'firstName': first, 'lastName': last,
                                                 'role': role, 'temporaryPassword': DEMO_PW})['id']

offer = call('POST', '/document-types', admin, {'name': 'Offer letter', 'fields': [
    {'key': 'employee_no', 'label': 'Employee number', 'dataType': 'TEXT', 'required': True},
    {'key': 'start_date', 'label': 'Start date', 'dataType': 'DATE', 'required': True},
    {'key': 'grade', 'label': 'Grade', 'dataType': 'ENUM', 'required': False, 'allowedValues': ['G1', 'G2', 'G3', 'G4']},
]})['id']
call('POST', '/document-types', admin, {'name': 'Loan agreement', 'fields': [
    {'key': 'loan_no', 'label': 'Loan number', 'dataType': 'TEXT', 'required': True},
    {'key': 'amount', 'label': 'Amount (KES)', 'dataType': 'NUMBER', 'required': True},
]})
call('POST', '/document-types', admin, {'name': 'Policy', 'fields': []})


def cabinet(name, visibility='DEFAULT', token=admin):
    return call('POST', '/cabinets', token, {'name': name, 'visibility': visibility})['id']


def folder(cab, name, parent=None):
    body = {'name': name} | ({'parentId': parent} if parent else {})
    return call('POST', f'/cabinets/{cab}/folders', admin, body)['id']


def sub(folder_id, name):
    return call('POST', f'/folders/{folder_id}/sub-dividers', admin, {'name': name})['id']


hr = cabinet('HR employee files')
policies = cabinet('Company policies')
customers = cabinet('Customers')
cabinet('Audit and risk')
cabinet('Company secretarial')

grace = login('grace.wanjiru@mycredit.test', DEMO_PW)
for person, emp, start in [('Adrianne Gorie', 'E-1042', '2026-02-01'), ('Wanjiku Kamau', 'E-1077', '2026-05-15'),
                           ('Brian Mwangi', 'E-1103', '2026-09-01')]:
    f = folder(hr, person)
    forms, payroll = sub(f, 'Completed forms'), sub(f, 'Payroll and tax documents')
    sub(f, 'Performance evaluations')
    upload(grace, f, f'Offer letter - {person}.pdf', pdf([
        'MyCredit Limited', f'Offer of employment: {person}', f'Employee number {emp}',
        f'Start date {start}. Probation of six months applies.', 'Confidential employment agreement.']),
        sub=forms, doc_type=offer, metadata={'employee_no': emp, 'start_date': start, 'grade': 'G2'})
    upload(grace, f, f'Emergency contact form - {person}.pdf', pdf([
        f'Emergency contact form for {person}', 'Next of kin details and phone numbers.']), sub=forms)
    upload(grace, f, f'P9 tax deduction card 2026 - {person}.pdf', pdf([
        f'P9 tax deduction card for {person}', 'Kenya Revenue Authority, PAYE year 2026.']), sub=payroll)

pol = folder(policies, 'Human resources')
for title, body in [('Leave policy', 'Annual leave of 21 working days. Carry-over limited to 5 days.'),
                    ('Code of conduct', 'Integrity, confidentiality and conflicts of interest.'),
                    ('Data protection policy', 'Personal data is processed under the Data Protection Act 2019.')]:
    upload(grace, pol, f'{title}.pdf', pdf([title, body]))
it = folder(policies, 'Information technology')
upload(grace, it, 'Acceptable use policy.pdf', pdf(['Acceptable use policy', 'Laptops, email and passwords.']))

for client in ['Acme Traders', 'Baraka Farms', 'Jabali Logistics']:
    c = folder(customers, client)
    loans = folder(customers, 'Loans', parent=c)
    upload(grace, loans, f'Loan agreement - {client}.pdf', pdf([
        f'Loan agreement between MyCredit Limited and {client}', 'Repayment over 24 months at 14% per annum.']))
    folder(customers, 'Correspondence', parent=c)

cabinet('My drafts', 'PERSONAL', grace)

wf = call('POST', '/workflows', admin, {'name': 'Policy approval', 'description': 'Department review then HR sign-off', 'steps': [
    {'name': 'Department review', 'approvalMode': 'ANY', 'assigneeRole': 'DEPT_USER', 'dueDays': 3},
    {'name': 'HR sign-off', 'approvalMode': 'ALL', 'assigneeUserIds': [users['peter.otieno@mycredit.test']], 'dueDays': 2},
]})['id']
draft = upload(grace, pol, 'Remote work policy (draft).pdf', pdf(['Remote work policy', 'Up to two days a week from home.']))
time.sleep(8)  # let the processing worker scan the new uploads before submitting
call('POST', f'/documents/{draft}/reviews', grace, {'definitionId': wf, 'comment': 'Ready for department review'})

print('Seeded. Sign in as', ADMIN, '/', PW, 'or any demo user with', DEMO_PW)
