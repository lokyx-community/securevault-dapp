import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

async function deployVaultFixture() {
  const [owner, other] = await ethers.getSigners();
  const vault = await ethers.deployContract("SecureVault");
  await vault.waitForDeployment();
  return { vault, owner, other };
}

describe("SecureVault", function () {
  it("accepts deposits and updates the account and total balances", async function () {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    const amount = ethers.parseEther("1");

    await expect(vault.deposit({ value: amount }))
      .to.emit(vault, "Deposited")
      .withArgs(owner.address, amount, amount);

    expect(await vault.depositsOf(owner.address)).to.equal(amount);
    expect(await vault.totalDeposits()).to.equal(amount);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(amount);
  });

  it("rejects zero-value deposits", async function () {
    const { vault } = await loadFixture(deployVaultFixture);
    await expect(vault.deposit({ value: 0 })).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("allows a user to withdraw their own funds", async function () {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    const amount = ethers.parseEther("1");
    await vault.deposit({ value: amount });

    await expect(vault.withdraw(ethers.parseEther("0.4")))
      .to.emit(vault, "Withdrawn")
      .withArgs(owner.address, ethers.parseEther("0.4"), ethers.parseEther("0.6"));

    expect(await vault.depositsOf(owner.address)).to.equal(ethers.parseEther("0.6"));
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("0.6"));
  });

  it("prevents withdrawing more than the caller deposited", async function () {
    const { vault, owner, other } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1") });

    await expect(vault.connect(other).withdraw(1))
      .to.be.revertedWithCustomError(vault, "InsufficientDeposit")
      .withArgs(1, 0);
    await expect(vault.connect(owner).withdraw(ethers.parseEther("2")))
      .to.be.revertedWithCustomError(vault, "InsufficientDeposit")
      .withArgs(ethers.parseEther("2"), ethers.parseEther("1"));
  });

  it("rejects zero-value withdrawals", async function () {
    const { vault } = await loadFixture(deployVaultFixture);
    await expect(vault.withdraw(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("keeps user balances isolated", async function () {
    const { vault, owner, other } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).deposit({ value: ethers.parseEther("1") });
    await vault.connect(other).deposit({ value: ethers.parseEther("2") });

    expect(await vault.depositsOf(owner.address)).to.equal(ethers.parseEther("1"));
    expect(await vault.depositsOf(other.address)).to.equal(ethers.parseEther("2"));
    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("3"));
  });
});
