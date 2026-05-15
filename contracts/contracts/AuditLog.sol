// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./RoleManager.sol";

contract AuditLog {
    RoleManager public immutable roleManager;

    event ProcurementAuditEvent(
        bytes32 indexed tenderKey,
        string tenderId,
        string action,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        string fromState,
        string toState,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event UnauthorizedActionAttempted(
        bytes32 indexed tenderKey,
        string tenderId,
        string attemptedAction,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 reasonHash,
        uint256 timestamp
    );

    event TamperingDetected(
        bytes32 indexed tenderKey,
        string tenderId,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 expectedDocumentHash,
        bytes32 observedDocumentHash,
        bytes32 metadataHash,
        uint256 timestamp
    );

    modifier onlyRelayer() {
        require(roleManager.isAuthorizedRelayer(msg.sender), "RELAYER_NOT_AUTHORIZED");
        _;
    }

    constructor(address roleManagerAddress) {
        require(roleManagerAddress != address(0), "INVALID_ROLE_MANAGER");
        roleManager = RoleManager(roleManagerAddress);
    }

    function recordAuditEvent(
        string calldata tenderId,
        string calldata action,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        string calldata fromState,
        string calldata toState,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireEventMetadata(tenderId, action, actorEmployeeHash, actorRole);

        emit ProcurementAuditEvent(
            _tenderKey(tenderId),
            tenderId,
            action,
            actorEmployeeHash,
            actorRole,
            fromState,
            toState,
            metadataHash,
            block.timestamp
        );
    }

    function recordUnauthorizedAttempt(
        string calldata tenderId,
        string calldata attemptedAction,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 reasonHash
    ) external onlyRelayer {
        _requireEventMetadata(tenderId, attemptedAction, actorEmployeeHash, actorRole);
        require(reasonHash != bytes32(0), "INVALID_REASON_HASH");

        emit UnauthorizedActionAttempted(
            _tenderKey(tenderId),
            tenderId,
            attemptedAction,
            actorEmployeeHash,
            actorRole,
            reasonHash,
            block.timestamp
        );
    }

    function recordTamperingDetected(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 expectedDocumentHash,
        bytes32 observedDocumentHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        require(bytes(tenderId).length > 0, "INVALID_TENDER_ID");
        require(actorEmployeeHash != bytes32(0), "INVALID_ACTOR_HASH");
        require(bytes(actorRole).length > 0, "INVALID_ACTOR_ROLE");
        require(expectedDocumentHash != bytes32(0), "INVALID_EXPECTED_HASH");
        require(observedDocumentHash != bytes32(0), "INVALID_OBSERVED_HASH");
        require(expectedDocumentHash != observedDocumentHash, "HASHES_MATCH");

        emit TamperingDetected(
            _tenderKey(tenderId),
            tenderId,
            actorEmployeeHash,
            actorRole,
            expectedDocumentHash,
            observedDocumentHash,
            metadataHash,
            block.timestamp
        );
    }

    function _requireEventMetadata(
        string calldata tenderId,
        string calldata action,
        bytes32 actorEmployeeHash,
        string calldata actorRole
    ) private pure {
        require(bytes(tenderId).length > 0, "INVALID_TENDER_ID");
        require(bytes(action).length > 0, "INVALID_ACTION");
        require(actorEmployeeHash != bytes32(0), "INVALID_ACTOR_HASH");
        require(bytes(actorRole).length > 0, "INVALID_ACTOR_ROLE");
    }

    function _tenderKey(string calldata tenderId) private pure returns (bytes32) {
        return keccak256(bytes(tenderId));
    }
}
