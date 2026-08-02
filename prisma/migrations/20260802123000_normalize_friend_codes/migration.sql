-- Store every valid friend code as three blocks of four digits.
-- Legacy values with exactly 12 digits are repaired regardless of separators.
-- Malformed legacy values are cleared so they are no longer treated as valid codes.
WITH RECURSIVE
friend_code_digits("id", "source", "position", "digits") AS (
  SELECT "id", COALESCE("code", ''), 1, ''
  FROM "Entry"

  UNION ALL

  SELECT
    "id",
    "source",
    "position" + 1,
    "digits" ||
      CASE
        WHEN substr("source", "position", 1) GLOB '[0-9]'
          THEN substr("source", "position", 1)
        ELSE ''
      END
  FROM friend_code_digits
  WHERE "position" <= length("source")
),
normalized_friend_codes("id", "digits") AS (
  SELECT "id", "digits"
  FROM friend_code_digits
  WHERE "position" = length("source") + 1
)
UPDATE "Entry"
SET "code" = COALESCE((
  SELECT
    CASE
      WHEN length("digits") = 12 THEN
        substr("digits", 1, 4) || ' ' ||
        substr("digits", 5, 4) || ' ' ||
        substr("digits", 9, 4)
      ELSE ''
    END
  FROM normalized_friend_codes
  WHERE normalized_friend_codes."id" = "Entry"."id"
), '');
