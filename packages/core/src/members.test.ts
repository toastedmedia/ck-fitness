import { describe, expect, it } from "vitest";
import { normalizePhone, parseMembers, splitName } from "./members";

describe("normalizePhone", () => {
  it("adds +1 to 10 digit numbers and cleans punctuation", () => {
    expect(normalizePhone("(604) 555-0199")).toBe("+16045550199");
    expect(normalizePhone("1-604-555-0199")).toBe("+16045550199");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("drops junk", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("splitName", () => {
  it("splits first and the rest", () => {
    expect(splitName("Chanveer Kaur Sandhu")).toEqual({
      first: "Chanveer",
      last: "Kaur Sandhu",
    });
    expect(splitName("Madonna")).toEqual({ first: "Madonna", last: "" });
  });
});

describe("parseMembers", () => {
  it("reads Go High Level style headers, skips bad and repeated emails", () => {
    const r = parseMembers([
      ["Contact Name", "First Name", "Last Name", "Email", "Phone", "Tags"],
      ["A B", "Asha", "Brar", "ASHA@Example.com", "604-555-0100", "x"],
      ["C D", "", "", "not-an-email", "", ""],
      ["E F", "Asha", "Brar", "asha@example.com", "", ""],
      ["G H", "", "", "gh@example.com", "bad", ""],
    ]);
    expect(r.rows.map((x) => x.email)).toEqual(["asha@example.com", "gh@example.com"]);
    expect(r.rows[0]).toMatchObject({
      first: "Asha",
      last: "Brar",
      phone: "+16045550100",
    });
    expect(r.rows[1]).toMatchObject({ first: "G", last: "H", phone: null });
    expect(r.rows[1].notes).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });
  it("needs an email column", () => {
    expect(
      parseMembers([
        ["Name", "Phone"],
        ["A", "1"],
      ]).missingEmailColumn,
    ).toBe(true);
    expect(parseMembers([]).missingEmailColumn).toBe(true);
  });
});
