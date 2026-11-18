import { parseGiftCodes } from "../../pages/api/admin/gifts"
jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }))
jest.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }))
jest.mock("../../lib/prisma", () => ({ __esModule: true, default: {} }))

describe("gift-code CSV imports", () => {
  test("reads a single-column CSV", () => {
    expect(parseGiftCodes("ABC123\nDEF456\n", "csv")).toEqual(["ABC123", "DEF456"])
  })
  test("supports code headers and ignores unrelated columns", () => {
    expect(parseGiftCodes('description,Code,other\n"Free gift",ABC123,X\n"Another",DEF456,Y', "csv"))
      .toEqual(["ABC123", "DEF456"])
  })
  test("allows BOM and quoted values", () => {
    expect(parseGiftCodes('\uFEFFcode\n"ABC123"\n"DEF456"', "csv")).toEqual(["ABC123", "DEF456"])
  })
  test("accepts comma-separated codes in a headerless CSV", () => {
    expect(parseGiftCodes("ABC123,DEF456,GHI789", "csv"))
      .toEqual(["ABC123", "DEF456", "GHI789"])
  })
  test("accepts several rows with differing numbers of codes", () => {
    expect(parseGiftCodes("ABC123,DEF456\nGHI789\nJKL012,MNO345,PQR678", "csv"))
      .toEqual(["ABC123", "DEF456", "GHI789", "JKL012", "MNO345", "PQR678"])
  })
  test("honours quoted headerless CSV cells", () => {
    expect(parseGiftCodes('"ABC123","DEF456"\n"GHI789"', "csv"))
      .toEqual(["ABC123", "DEF456", "GHI789"])
  })
  test("preserves manually pasted codes", () => {
    expect(parseGiftCodes("ABC123, DEF456\nGHI789", "text")).toEqual(["ABC123", "DEF456", "GHI789"])
  })
})
