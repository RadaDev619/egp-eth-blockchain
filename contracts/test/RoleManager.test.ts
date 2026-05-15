import { expect } from "chai";
import { deployContracts } from "./helpers";

describe("RoleManager", () => {
  it("sets the deployer as owner", async () => {
    const { owner, roleManager } = await deployContracts();

    expect(await roleManager.owner()).to.equal(owner.address);
  });

  it("allows the owner to authorize and revoke a backend relayer", async () => {
    const { relayer, roleManager } = await deployContracts();

    await expect(roleManager.authorizeRelayer(relayer.address, false))
      .to.emit(roleManager, "RelayerAuthorizationUpdated")
      .withArgs(relayer.address, false);

    expect(await roleManager.isAuthorizedRelayer(relayer.address)).to.equal(false);

    await expect(roleManager.authorizeRelayer(relayer.address, true))
      .to.emit(roleManager, "RelayerAuthorizationUpdated")
      .withArgs(relayer.address, true);

    expect(await roleManager.isAuthorizedRelayer(relayer.address)).to.equal(true);
  });

  it("blocks non-owners from authorizing relayers", async () => {
    const { outsider, relayer, roleManager } = await deployContracts();

    await expect(roleManager.connect(outsider).authorizeRelayer(relayer.address, true)).to.be.revertedWith(
      "ONLY_OWNER"
    );
  });
});
