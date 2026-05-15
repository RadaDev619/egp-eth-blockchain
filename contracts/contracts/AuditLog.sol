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

    event LifecycleProofRecorded(
        bytes32 indexed tenderKey,
        string tenderId,
        string proofType,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 indexed subjectHash,
        string subjectType,
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

    function recordTenderManifestCommitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 manifestHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "TENDER_MANIFEST_COMMITTED",
            actorEmployeeHash,
            actorRole,
            manifestHash,
            "TENDER_MANIFEST",
            metadataHash
        );
    }

    function recordTenderPublished(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 manifestHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "TENDER_PUBLISHED",
            actorEmployeeHash,
            actorRole,
            manifestHash,
            "TENDER_MANIFEST",
            metadataHash
        );
    }

    function recordProposalPackageSubmitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 packageHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "PROPOSAL_PACKAGE_SUBMITTED",
            actorEmployeeHash,
            actorRole,
            packageHash,
            "PROPOSAL_PACKAGE",
            metadataHash
        );
    }

    function recordProposalEnvelopeCommitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        string calldata envelopeType,
        bytes32 envelopeManifestHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireNonEmpty(envelopeType, "INVALID_ENVELOPE_TYPE");
        _recordLifecycleProof(
            tenderId,
            "PROPOSAL_ENVELOPE_COMMITTED",
            actorEmployeeHash,
            actorRole,
            envelopeManifestHash,
            envelopeType,
            metadataHash
        );
    }

    function recordTenderClosed(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 closureHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "TENDER_CLOSED",
            actorEmployeeHash,
            actorRole,
            closureHash,
            "TENDER_CLOSE",
            metadataHash
        );
    }

    function recordKeyReleaseLogged(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        string calldata envelopeType,
        bytes32 keyReleaseHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireNonEmpty(envelopeType, "INVALID_ENVELOPE_TYPE");
        _recordLifecycleProof(
            tenderId,
            "KEY_RELEASE_LOGGED",
            actorEmployeeHash,
            actorRole,
            keyReleaseHash,
            envelopeType,
            metadataHash
        );
    }

    function recordEvaluationReportCommitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 reportHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "EVALUATION_REPORT_COMMITTED",
            actorEmployeeHash,
            actorRole,
            reportHash,
            "EVALUATION_REPORT",
            metadataHash
        );
    }

    function recordAwardRecommended(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 recommendationHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "AWARD_RECOMMENDED",
            actorEmployeeHash,
            actorRole,
            recommendationHash,
            "AWARD_RECOMMENDATION",
            metadataHash
        );
    }

    function recordAwardApproved(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 approvalHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "AWARD_APPROVED",
            actorEmployeeHash,
            actorRole,
            approvalHash,
            "AWARD_APPROVAL",
            metadataHash
        );
    }

    function recordContractHashCommitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 contractHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _recordLifecycleProof(
            tenderId,
            "CONTRACT_HASH_COMMITTED",
            actorEmployeeHash,
            actorRole,
            contractHash,
            "CONTRACT_HASH",
            metadataHash
        );
    }

    function _requireEventMetadata(
        string calldata tenderId,
        string memory action,
        bytes32 actorEmployeeHash,
        string calldata actorRole
    ) private pure {
        _requireNonEmpty(tenderId, "INVALID_TENDER_ID");
        _requireNonEmpty(action, "INVALID_ACTION");
        require(actorEmployeeHash != bytes32(0), "INVALID_ACTOR_HASH");
        _requireNonEmpty(actorRole, "INVALID_ACTOR_ROLE");
    }

    function _recordLifecycleProof(
        string calldata tenderId,
        string memory proofType,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 subjectHash,
        string memory subjectType,
        bytes32 metadataHash
    ) private {
        _requireEventMetadata(tenderId, proofType, actorEmployeeHash, actorRole);
        require(subjectHash != bytes32(0), "INVALID_SUBJECT_HASH");
        require(bytes(subjectType).length > 0, "INVALID_SUBJECT_TYPE");

        emit LifecycleProofRecorded(
            _tenderKey(tenderId),
            tenderId,
            proofType,
            actorEmployeeHash,
            actorRole,
            subjectHash,
            subjectType,
            metadataHash,
            block.timestamp
        );
    }

    function _requireNonEmpty(string memory value, string memory reason) private pure {
        require(bytes(value).length > 0, reason);
    }

    function _tenderKey(string calldata tenderId) private pure returns (bytes32) {
        return keccak256(bytes(tenderId));
    }
}
