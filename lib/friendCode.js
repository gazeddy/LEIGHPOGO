const FRIEND_CODE_DIGIT_COUNT = 12

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "")

export const normalizeFriendCode = (value) => {
  const digits = digitsOnly(value)
  return digits.length === FRIEND_CODE_DIGIT_COUNT ? digits : null
}

export const formatFriendCode = (value) => {
  const digits = normalizeFriendCode(value)
  return digits ? digits.replace(/(\d{4})(?=\d)/g, "$1 ") : ""
}

export const formatFriendCodeInput = (value) =>
  digitsOnly(value)
    .slice(0, FRIEND_CODE_DIGIT_COUNT)
    .replace(/(\d{4})(?=\d)/g, "$1 ")

export const canonicalFriendCode = (value) => formatFriendCode(value) || null
