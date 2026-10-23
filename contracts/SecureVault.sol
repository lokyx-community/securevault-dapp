// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SecureVault
/// @notice A minimal ETH vault where each address can withdraw only its own deposits.
/// @dev Demo/portfolio contract. Review and test before any production use.
contract SecureVault is ReentrancyGuard {
    mapping(address account => uint256 amount) private _deposits;
    uint256 public totalDeposits;

    event Deposited(address indexed account, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed account, uint256 amount, uint256 remainingBalance);

    error ZeroAmount();
    error InsufficientDeposit(uint256 requested, uint256 available);
    error TransferFailed();

    /// @notice Deposit ETH into your own vault balance.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();

        _deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;

        emit Deposited(msg.sender, msg.value, _deposits[msg.sender]);
    }

    /// @notice Withdraw ETH from your own vault balance.
    /// @dev Effects happen before the external call; reentrancy is also guarded.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 available = _deposits[msg.sender];
        if (amount > available) revert InsufficientDeposit(amount, available);

        _deposits[msg.sender] = available - amount;
        totalDeposits -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount, _deposits[msg.sender]);
    }

    /// @notice Read an account's recorded deposit balance.
    function depositsOf(address account) external view returns (uint256) {
        return _deposits[account];
    }
}
