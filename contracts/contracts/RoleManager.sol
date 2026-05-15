// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RoleManager {
    address public owner;

    mapping(address relayer => bool authorized) private authorizedRelayers;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RelayerAuthorizationUpdated(address indexed relayer, bool authorized);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "INVALID_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function authorizeRelayer(address relayer, bool authorized) external onlyOwner {
        require(relayer != address(0), "INVALID_RELAYER");
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorizationUpdated(relayer, authorized);
    }

    function isAuthorizedRelayer(address relayer) external view returns (bool) {
        return authorizedRelayers[relayer];
    }
}
