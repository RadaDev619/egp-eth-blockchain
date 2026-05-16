# Pitch And Disclosure Notes

## One-Line Message

This is a Bhutan e-GP trust layer middleware MVP that uses mock Bhutan NDI employment identity, tender-specific backend policy, MVP encrypted proposal envelopes, selective key release, gasless Ethereum relayer proofs, and immutable audit logs to make hidden procurement manipulation visible and harder to execute.

## Thirty-Second Pitch

Centralized procurement systems can store documents and logs, but privileged actors may still control edits, access timing, and audit visibility. This MVP adds a trust layer beside e-GP: mock Bhutan NDI identifies the actor, the backend maps employment identity to role and tender assignment, proposal envelopes are encrypted before old-system storage, key release is stage-gated, and critical proof hashes are recorded through a backend gasless Ethereum relayer. The public audit portal shows proof metadata without exposing raw Employment IDs or proposal contents.

## Required Disclosure

- Bhutan NDI is mocked for hackathon reliability.
- Old e-GP integration is simulated; official e-GP APIs are not connected.
- Proposal encryption is real MVP WebCrypto AES-GCM before upload.
- Key release uses local/MVP KMS logic, not a production HSM.
- Blockchain can run in `mock`, `local`, or `sepolia` mode.
- The browser never connects a blockchain account and never signs transactions.
- Raw Employment ID is not written on-chain; proofs use salted `employeeHash`.

## Do Not Claim

- Do not claim this replaces Bhutan e-GP.
- Do not claim production NDI onboarding is complete.
- Do not claim production HSM or government key custody.
- Do not claim public IPFS/object storage is privacy-approved.
- Do not claim a formal smart-contract audit.

## Demo Close

The key point is not that blockchain replaces procurement workflow. The key point is that identity, policy, encryption, key release, and proof logging are enforced by a separate backend trust layer, so premature access and hidden manipulation become visible audit events.
