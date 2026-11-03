import { describe, it, expect } from "vitest";
import { choisirIpLan, type CandidateInterface } from "../../src/shared/reseau.js";

// P4a (plan 014) : le QR « Acces Smartphone Wi-Fi » ment si l'IP annoncee est
// un pont docker (172.17.0.1, mesure le 02/11). La fonction est pure : le banc
// la juge sans dependre du poste.

const v4 = (address: string): CandidateInterface => ({ name: "x", family: "IPv4", address, internal: false });
const carte = (name: string, address: string): [string, CandidateInterface[]] =>
  [name, [v4(address)]];

describe("choisirIpLan (l'IP annoncee, ou rien)", () => {
  it("wifi + tailscale + docker -> le wifi, pas les ponts", () => {
    expect(choisirIpLan(Object.fromEntries([
      carte("wlan0", "192.168.1.8"),
      carte("tailscale0", "100.64.16.46"),
      carte("docker0", "172.17.0.1"),
    ]))).toBe("192.168.1.8");
  });

  it("tailscale seul -> null (pas une adresse LAN)", () => {
    expect(choisirIpLan(Object.fromEntries([carte("tailscale0", "100.64.16.46")])))
      .toBeNull();
  });

  it("169.254 (lien local) ignore ; s'il ne reste rien -> null", () => {
    expect(choisirIpLan(Object.fromEntries([carte("wlan0", "169.254.12.30")])))
      .toBeNull();
  });

  it("10.x prefere a 172.16-31.x ; 192.168 prefere aux deux", () => {
    expect(choisirIpLan(Object.fromEntries([
      carte("br-9f2", "172.18.0.1"),
      carte("eth0", "10.0.0.5"),
    ]))).toBe("10.0.0.5");
    expect(choisirIpLan(Object.fromEntries([
      carte("eth0", "10.0.0.5"),
      carte("wlan0", "192.168.1.8"),
    ]))).toBe("192.168.1.8");
  });

  it("internal et non-IPv4 ne comptent pas", () => {
    expect(choisirIpLan(Object.fromEntries([
      ["lo", [{ name: "lo", family: "IPv4", address: "127.0.0.1", internal: true }]],
      ["wlan0", [{ name: "wlan0", family: "IPv6", address: "fe80::1", internal: false }]],
    ]))).toBeNull();
  });

  it("Windows : vEthernet/Hyper-V/Wsl ecartes, la carte reelle garde la main", () => {
    expect(choisirIpLan(Object.fromEntries([
      carte("vEthernet (WSL)", "172.24.160.1"),
      carte("Ethernet 3", "192.168.99.42"),
    ]))).toBe("192.168.99.42");
  });

  it("rejoue la mesure du 02/11 : le poste du maitre (docker 172.17.0.1) n'est JAMAIS rendu", () => {
    // L'ancienne logique rendait la premiere IPv4 non interne venue ; ici le
    // pont docker est ecarte par le nom ET par le rang.
    expect(choisirIpLan(Object.fromEntries([
      carte("docker0", "172.17.0.1"),
    ]))).toBeNull();
    const annonce = choisirIpLan(Object.fromEntries([
      carte("docker0", "172.17.0.1"),
      carte("Wi-Fi", "192.168.1.8"),
    ]));
    expect(annonce).not.toBe("172.17.0.1");
    expect(annonce).toBe("192.168.1.8");
  });
});
