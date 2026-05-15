import { ethers } from "hardhat";

export const tenderId = "BT-TDR-001";
export const secondTenderId = "BT-TDR-002";
export const procurementRole = "PROCUREMENT_OFFICER";
export const vendorRole = "VENDOR";
export const evaluatorRole = "EVALUATOR";
export const financeRole = "FINANCE_OFFICER";

export function textHash(value: string): string {
  return ethers.sha256(ethers.toUtf8Bytes(value));
}

export function tenderKey(value: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

export const procurementEmployeeHash = textHash("PROC-001:demo-employee-hash-salt");
export const vendorEmployeeHash = textHash("VEND-001:demo-employee-hash-salt");
export const evaluatorEmployeeHash = textHash("EVAL-001:demo-employee-hash-salt");
export const financeEmployeeHash = textHash("FIN-001:demo-employee-hash-salt");
export const documentHash = textHash("tender-document-v1.pdf");
export const amendedDocumentHash = textHash("tender-document-v2.pdf");
export const bidHash = textHash("vendor-bid-document.pdf");
export const metadataHash = textHash("canonical-procurement-metadata");
export const reasonHash = textHash("PERMISSION_MISSING");

export async function deployContracts() {
  const [owner, relayer, outsider] = await ethers.getSigners();

  const RoleManager = await ethers.getContractFactory("RoleManager");
  const roleManager = (await RoleManager.deploy()) as any;
  await roleManager.waitForDeployment();

  const roleManagerAddress = await roleManager.getAddress();

  const TenderRegistry = await ethers.getContractFactory("TenderRegistry");
  const tenderRegistry = (await TenderRegistry.deploy(roleManagerAddress)) as any;
  await tenderRegistry.waitForDeployment();

  const ApprovalManager = await ethers.getContractFactory("ApprovalManager");
  const approvalManager = (await ApprovalManager.deploy(roleManagerAddress, await tenderRegistry.getAddress())) as any;
  await approvalManager.waitForDeployment();

  const AuditLog = await ethers.getContractFactory("AuditLog");
  const auditLog = (await AuditLog.deploy(roleManagerAddress)) as any;
  await auditLog.waitForDeployment();

  await roleManager.connect(owner).authorizeRelayer(relayer.address, true);

  return {
    owner,
    relayer,
    outsider,
    roleManager,
    tenderRegistry,
    approvalManager,
    auditLog
  };
}

export async function createTender(tenderRegistry: any, relayer: any, id = tenderId) {
  await tenderRegistry.connect(relayer).recordTenderCreated(
    id,
    procurementEmployeeHash,
    procurementRole,
    documentHash,
    "ipfs://tender-document-v1",
    metadataHash
  );
}
