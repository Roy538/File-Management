/**
 * Predefined cabinet structures. Applying a template scaffolds a cabinet with a
 * standard set of folders (and optional sub-dividers / nested sub-folders),
 * enforcing a consistent layout across the organisation.
 */

export interface TemplateFolder {
  name: string;
  subDividers?: string[];
  children?: TemplateFolder[];
}

export interface CabinetTemplate {
  key: string;
  name: string;
  description: string;
  folders: TemplateFolder[];
}

export const CABINET_TEMPLATES: CabinetTemplate[] = [
  {
    key: 'hr-employee',
    name: 'HR — Employee File',
    description: 'Standard per-employee HR record structure.',
    folders: [
      { name: 'Completed Forms' },
      { name: 'Hire Documents', subDividers: ['Offer Letter', 'Contract', 'ID & Right to Work'] },
      { name: 'Payroll and Tax Documents', subDividers: ['Tax Forms', 'Direct Deposit', 'Pay Stubs'] },
      { name: 'Performance Evaluations' },
      { name: 'Misc' },
    ],
  },
  {
    key: 'customer-loan',
    name: 'Customer — Loan File',
    description: 'Lifecycle of a customer loan, from application to repayment.',
    folders: [
      { name: 'Application', subDividers: ['KYC / Identity', 'Income Proof', 'Collateral'] },
      { name: 'Underwriting & Approval' },
      { name: 'Disbursement' },
      { name: 'Repayment & Statements' },
      { name: 'Correspondence' },
    ],
  },
  {
    key: 'legal-matter',
    name: 'Legal — Matter File',
    description: 'Organise a legal matter or case.',
    folders: [
      { name: 'Pleadings' },
      { name: 'Contracts', subDividers: ['Active', 'Expired'] },
      { name: 'Correspondence' },
      { name: 'Evidence & Exhibits' },
      { name: 'Billing' },
    ],
  },
  {
    key: 'project',
    name: 'Project File',
    description: 'A general-purpose project workspace.',
    folders: [
      { name: 'Planning' },
      { name: 'Design', subDividers: ['Drafts', 'Approved'] },
      { name: 'Contracts & Procurement' },
      { name: 'Deliverables' },
      { name: 'Meeting Minutes' },
    ],
  },
  {
    key: 'department',
    name: 'Department — Generic',
    description: 'A simple starting structure for any department.',
    folders: [
      { name: 'Policies & Procedures' },
      { name: 'Reports' },
      { name: 'Correspondence' },
      { name: 'Archive' },
    ],
  },
];
