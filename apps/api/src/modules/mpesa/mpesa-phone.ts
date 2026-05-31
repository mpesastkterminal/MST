import { badRequest } from "../../core/errors/http-error";

export function normalizeKenyanPhoneNumber(input: string) {
  const digits = input.replace(/\D/g, "");

  if (digits.startsWith("254") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }

  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    return `254${digits}`;
  }

  throw badRequest("phone_number must be a valid Kenyan mobile number.");
}

export function maskPhoneNumber(phoneNumber: string | null | undefined) {
  if (!phoneNumber) {
    return null;
  }

  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.length < 7) {
    return "***";
  }

  return `${digits.slice(0, 5)}***${digits.slice(-3)}`;
}
