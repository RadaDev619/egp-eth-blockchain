// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./RoleManager.sol";

contract TenderRegistry {
    RoleManager public immutable roleManager;

    struct TenderRecord {
        bool exists;
        uint256 latestVersion;
        bytes32 latestDocumentHash;
        string latestIpfsCid;
        string currentState;
        uint256 createdAt;
    }

    mapping(string tenderId => TenderRecord record) private tenders;

    event TenderCreated(
        bytes32 indexed tenderKey,
        string tenderId,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 documentHash,
        string ipfsCid,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event TenderVersionCreated(
        bytes32 indexed tenderKey,
        string tenderId,
        uint256 versionNumber,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 documentHash,
        string ipfsCid,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event BidSubmitted(
        bytes32 indexed tenderKey,
        string tenderId,
        bytes32 indexed actorEmployeeHash,
        string actorRole,
        bytes32 bidHash,
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

    function recordTenderCreated(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 documentHash,
        string calldata ipfsCid,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireNonEmpty(tenderId, "INVALID_TENDER_ID");
        _requireActorMetadata(actorEmployeeHash, actorRole);
        require(documentHash != bytes32(0), "INVALID_DOCUMENT_HASH");
        require(!tenders[tenderId].exists, "TENDER_ALREADY_EXISTS");

        tenders[tenderId] = TenderRecord({
            exists: true,
            latestVersion: 1,
            latestDocumentHash: documentHash,
            latestIpfsCid: ipfsCid,
            currentState: "CREATED",
            createdAt: block.timestamp
        });

        emit TenderCreated(
            _tenderKey(tenderId),
            tenderId,
            actorEmployeeHash,
            actorRole,
            documentHash,
            ipfsCid,
            metadataHash,
            block.timestamp
        );
    }

    function recordTenderVersionCreated(
        string calldata tenderId,
        uint256 versionNumber,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 documentHash,
        string calldata ipfsCid,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireActorMetadata(actorEmployeeHash, actorRole);
        require(documentHash != bytes32(0), "INVALID_DOCUMENT_HASH");

        TenderRecord storage tender = tenders[tenderId];
        require(tender.exists, "TENDER_NOT_FOUND");
        require(versionNumber == tender.latestVersion + 1, "INVALID_VERSION_SEQUENCE");

        tender.latestVersion = versionNumber;
        tender.latestDocumentHash = documentHash;
        tender.latestIpfsCid = ipfsCid;

        emit TenderVersionCreated(
            _tenderKey(tenderId),
            tenderId,
            versionNumber,
            actorEmployeeHash,
            actorRole,
            documentHash,
            ipfsCid,
            metadataHash,
            block.timestamp
        );
    }

    function recordBidSubmitted(
        string calldata tenderId,
        bytes32 actorEmployeeHash,
        string calldata actorRole,
        bytes32 bidHash,
        bytes32 metadataHash
    ) external onlyRelayer {
        _requireActorMetadata(actorEmployeeHash, actorRole);
        require(bidHash != bytes32(0), "INVALID_BID_HASH");

        TenderRecord storage tender = tenders[tenderId];
        require(tender.exists, "TENDER_NOT_FOUND");
        tender.currentState = "BID_SUBMITTED";

        emit BidSubmitted(
            _tenderKey(tenderId),
            tenderId,
            actorEmployeeHash,
            actorRole,
            bidHash,
            metadataHash,
            block.timestamp
        );
    }

    function tenderExists(string calldata tenderId) external view returns (bool) {
        return tenders[tenderId].exists;
    }

    function getTender(string calldata tenderId) external view returns (TenderRecord memory) {
        require(tenders[tenderId].exists, "TENDER_NOT_FOUND");
        return tenders[tenderId];
    }

    function _requireActorMetadata(bytes32 actorEmployeeHash, string calldata actorRole) private pure {
        require(actorEmployeeHash != bytes32(0), "INVALID_ACTOR_HASH");
        _requireNonEmpty(actorRole, "INVALID_ACTOR_ROLE");
    }

    function _requireNonEmpty(string calldata value, string memory reason) private pure {
        require(bytes(value).length > 0, reason);
    }

    function _tenderKey(string calldata tenderId) private pure returns (bytes32) {
        return keccak256(bytes(tenderId));
    }
}
