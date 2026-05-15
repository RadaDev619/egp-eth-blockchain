import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for ${network.name} deployment`);
  }
  return value;
}

function deploymentFileName(): string {
  if (network.name === "hardhat" || network.name === "localhost") {
    return "local.json";
  }

  return `${network.name}.json`;
}

async function main() {
  if (network.name === "sepolia") {
    requireEnv("SEPOLIA_RPC_URL");
    requireEnv("DEPLOYER_PRIVATE_KEY");
    requireEnv("RELAYER_ADDRESS");
  }

  const [deployer] = await ethers.getSigners();
  const relayerAddress = process.env.RELAYER_ADDRESS?.trim() || deployer.address;
  const chain = await ethers.provider.getNetwork();

  const RoleManager = await ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy();
  await roleManager.waitForDeployment();

  const roleManagerAddress = await roleManager.getAddress();

  const AuditLog = await ethers.getContractFactory("AuditLog");
  const auditLog = await AuditLog.deploy(roleManagerAddress);
  await auditLog.waitForDeployment();

  const TenderRegistry = await ethers.getContractFactory("TenderRegistry");
  const tenderRegistry = await TenderRegistry.deploy(roleManagerAddress);
  await tenderRegistry.waitForDeployment();

  const ApprovalManager = await ethers.getContractFactory("ApprovalManager");
  const approvalManager = await ApprovalManager.deploy(roleManagerAddress, await tenderRegistry.getAddress());
  await approvalManager.waitForDeployment();

  const authorizeTx = await roleManager.authorizeRelayer(relayerAddress, true);
  await authorizeTx.wait();

  const deployment = {
    network: network.name,
    chainId: Number(chain.chainId),
    deployerAddress: deployer.address,
    relayerAddress,
    contracts: {
      roleManager: {
        address: roleManagerAddress,
        deployTxHash: roleManager.deploymentTransaction()?.hash ?? null
      },
      auditLog: {
        address: await auditLog.getAddress(),
        deployTxHash: auditLog.deploymentTransaction()?.hash ?? null
      },
      tenderRegistry: {
        address: await tenderRegistry.getAddress(),
        deployTxHash: tenderRegistry.deploymentTransaction()?.hash ?? null
      },
      approvalManager: {
        address: await approvalManager.getAddress(),
        deployTxHash: approvalManager.deploymentTransaction()?.hash ?? null
      }
    },
    authorizationTxHash: authorizeTx.hash,
    createdAt: new Date().toISOString()
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  mkdirSync(deploymentsDir, { recursive: true });
  const outputPath = path.join(deploymentsDir, deploymentFileName());
  writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(`Network: ${deployment.network} (${deployment.chainId})`);
  console.log(`Deployer: ${deployment.deployerAddress}`);
  console.log(`Authorized relayer: ${deployment.relayerAddress}`);
  console.log(`RoleManager: ${deployment.contracts.roleManager.address}`);
  console.log(`AuditLog: ${deployment.contracts.auditLog.address}`);
  console.log(`TenderRegistry: ${deployment.contracts.tenderRegistry.address}`);
  console.log(`ApprovalManager: ${deployment.contracts.approvalManager.address}`);
  console.log(`Deployment artifact: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
