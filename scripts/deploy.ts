import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SecureVault with:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const vault = await ethers.deployContract("SecureVault");
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("SecureVault deployed to:", address);
  console.log("Next: set VITE_VAULT_ADDRESS in frontend/.env and VITE_CHAIN_ID=11155111 for Sepolia.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
