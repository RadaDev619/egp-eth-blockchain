// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./RoleManager.sol";

interface ITenderRegistry {
    function tenderExists(string calldata tenderId) external view returns (bool);
}

contract ApprovalManager {
    RoleManager public immutable roleManager;
    ITenderRegistry public immutable tenderRegistry;

    struct ApprovalState {
        bool evaluationApproved;
        bool paymentApproved;
        bytes32 evaluationMetadataHash;
        bytes32 paymentMetadataHash;
    }

    mapping(string tenderId => ApprovalState state) private approvals;

    event EvaluationApproved(
        bytes32 indexed tenderKey,
        string tenderId,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        string fromState,
        string toState,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event PaymentApproved(
        bytes32 indexed tenderKey,
        string tenderId,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        string fromState,
        string toState,
        bytes32 metadataHash,
        uint256 timestamp
    );

    modifier onlyRelayer() {
        require(roleManager.isAuthorizedRelayer(msg.sender), "RELAYER_NOT_AUTHORIZED");
        _;
    }

    constructor(address roleManagerAddress, address tenderRegistryAddress) {
        require(roleManagerAddress != address(0), "INVALID_ROLE_MANAGER");
        require(tenderRegistryAddress != address(0), "INVALID_TENDER_REGISTRY");
        roleManager = RoleManager(roleManagerAddress);
        tenderRegistry = ITenderRegistry(tenderRegistryAddress);
    }

    function recordEvaluationApproved(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        string calldata fromState,
        string calldata toState,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireTenderAndActor(tenderId, actorEmployeeHash, actorRole);
        require(bytes(fromState).length > 0, "INVALID_FROM_STATE");
        require(bytes(toState).length > 0, "INVALID_TO_STATE");

        ApprovalState storage state = approvals[tenderId];
        require(!state.evaluationApproved, "EVALUATION_ALREADY_APPROVED");

        state.evaluationApproved = true;
        state.evaluationMetadataHash = metadataHash;

        emit EvaluationApproved(
            _tenderKey(tenderId),
            tenderId,
            actorEmployeeHash,
            actorRole,
            fromState,
            toState,
            metadataHash,
            block.timestamp
        );
    }

    function recordPaymentApproved(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        string calldata fromState,
        string calldata toState,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireTenderAndActor(tenderId, actorEmployeeHash, actorRole);
        require(bytes(fromState).length > 0, "INVALID_FROM_STATE");
        require(bytes(toState).length > 0, "INVALID_TO_STATE");

        ApprovalState storage state = approvals[tenderId];
        require(state.evaluationApproved, "EVALUATION_APPROVAL_REQUIRED");
        require(!state.paymentApproved, "PAYMENT_ALREADY_APPROVED");

        state.paymentApproved = true;
        state.paymentMetadataHash = metadataHash;

        emit PaymentApproved(
            _tenderKey(tenderId),
            tenderId,
            actorEmployeeHash,
            actorRole,
            fromState,
            toState,
            metadataHash,
            block.timestamp
        );
    }

    function getApprovalState(string calldata tenderId) external view returns (ApprovalState memory) {
        return approvals[tenderId];
    }

    function _requireTenderAndActor(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole
    ) private view {
        require(bytes(tenderId).length > 0, "INVALID_TENDER_ID");
        require(tenderRegistry.tenderExists(tenderId), "TENDER_NOT_FOUND");
        require(actorEmployeeHash != bytes32(0), "INVALID_ACTOR_HASH");
        require(bytes(actorRole).length > 0, "INVALID_ACTOR_ROLE");
    }

    function _tenderKey(string calldata tenderId) private pure returns (bytes32) {
        return keccak256(bytes(tenderId));
    }
}
