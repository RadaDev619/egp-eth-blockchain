import type { Role } from "@prisma/client";

export type DemoNdiProfile = {
  employmentId: string;
  holderDID: string;
  employer: string;
  position: string;
  employmentType: string;
  role: Role;
};

export const demoProfiles: DemoNdiProfile[] = [
  {
    employmentId: "PROC-001",
    holderDID: "did:key:mock-procurement-officer",
    employer: "Ministry of Finance",
    position: "Procurement Officer",
    employmentType: "Regular",
    role: "PROCUREMENT_OFFICER"
  },
  {
    employmentId: "VEND-001",
    holderDID: "did:key:mock-vendor",
    employer: "Demo Vendor Pvt Ltd",
    position: "Vendor Representative",
    employmentType: "Contract",
    role: "VENDOR"
  },
  {
    employmentId: "EVAL-001",
    holderDID: "did:key:mock-evaluator",
    employer: "Evaluation Committee",
    position: "Technical Evaluator",
    employmentType: "Committee",
    role: "EVALUATOR"
  },
  {
    employmentId: "TEC-001",
    holderDID: "did:key:mock-tec-member",
    employer: "Tender Evaluation Committee",
    position: "TEC Member",
    employmentType: "Committee",
    role: "TEC_MEMBER"
  },
  {
    employmentId: "TEC-CHAIR-001",
    holderDID: "did:key:mock-tec-chair",
    employer: "Tender Evaluation Committee",
    position: "TEC Chairperson",
    employmentType: "Committee",
    role: "TEC_CHAIR"
  },
  {
    employmentId: "FIN-001",
    holderDID: "did:key:mock-finance-officer",
    employer: "Ministry of Finance",
    position: "Finance Officer",
    employmentType: "Regular",
    role: "FINANCE_OFFICER"
  },
  {
    employmentId: "APP-001",
    holderDID: "did:key:mock-approving-officer",
    employer: "Ministry of Finance",
    position: "Approving Officer",
    employmentType: "Regular",
    role: "APPROVING_OFFICER"
  },
  {
    employmentId: "APP-002",
    holderDID: "did:key:mock-approving-officer-two",
    employer: "Ministry of Finance",
    position: "Second Approving Officer",
    employmentType: "Regular",
    role: "APPROVING_OFFICER"
  },
  {
    employmentId: "BANK-001",
    holderDID: "did:key:mock-financial-institution-officer",
    employer: "Demo Bank Ltd",
    position: "Financial Institution Officer",
    employmentType: "Regular",
    role: "FINANCIAL_INSTITUTION_OFFICER"
  },
  {
    employmentId: "AUD-001",
    holderDID: "did:key:mock-auditor",
    employer: "Royal Audit Authority",
    position: "Auditor",
    employmentType: "Regular",
    role: "AUDITOR"
  }
];

export function publicDemoProfiles() {
  return demoProfiles.map(({ holderDID: _holderDID, ...profile }) => profile);
}
