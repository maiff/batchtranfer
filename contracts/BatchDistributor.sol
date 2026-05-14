// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BatchDistributor is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => bool) public recipientWhitelist;

    event RecipientWhitelistUpdated(address indexed recipient, bool allowed);

    constructor(address initialOwner) Ownable(initialOwner) {
        _setRecipientAllowed(0x459080fE44E477Aeab9D5947Db55dF2d6B33a9a3, true);
        _setRecipientAllowed(0xD92D818C72AdBB88234f5Ba4F4C8b4E02b928744, true);
        _setRecipientAllowed(0xe4c03FC673C615b3453A757728957f742d5e9a57, true);
    }

    function batchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "length mismatch");

        IERC20 erc20 = IERC20(token);
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipientWhitelist[recipients[i]], "recipient not whitelisted");
            erc20.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
        }
    }

    function setRecipientAllowed(address recipient, bool allowed) external onlyOwner {
        _setRecipientAllowed(recipient, allowed);
    }

    function setRecipientsAllowed(address[] calldata recipients, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < recipients.length; i++) {
            _setRecipientAllowed(recipients[i], allowed);
        }
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function _setRecipientAllowed(address recipient, bool allowed) internal {
        require(recipient != address(0), "zero recipient");
        recipientWhitelist[recipient] = allowed;
        emit RecipientWhitelistUpdated(recipient, allowed);
    }
}
