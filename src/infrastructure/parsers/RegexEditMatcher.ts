import { Injectable } from "@nestjs/common";
import { EditIntentResult } from "../../domain/ports/EditIntentDetector";
import { detectDate } from "./RegexParser";

/** Động từ sửa */
const EDIT_VERBS = /^(sửa|sua|đổi|doi|chỉnh|chinh|edit)/i;

/** Từ khóa mục tiêu - xác nhận ý định sửa */
const EDIT_TARGET_KEYWORDS = /(?:thành|thanh|sang|lại|lai|danh\s*mục|ngày|ngay|về|ve)/i;

const EDIT_AMOUNT_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)\s+(?:thành|thanh|sang|lại|lai|về|ve)\s+(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)?$/i;

const EDIT_AMOUNT_BARE_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)\s+(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)$/i;

const EDIT_CATEGORY_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)\s+(?:thành|thanh|sang|lại\s*thành|lai\s*thanh|danh\s*mục(?:\s*(?:thành|sang|qua))?)\s+(.+?)(?:\s+(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu)?)?$/i;

const EDIT_DATE_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)\s+(?:ngày|ngay|thành|thanh|sang|lại|lai|về|ve)\s*(hôm\s*qua|hôm\s*kia|hq|\d+\s*(?:ngày|hôm)\s*trước)/i;

const EDIT_INCOMPLETE_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)(?:\s+(?:lại|lai|danh\s*mục|ngày|ngay))?$/i;

const EXPENSE_DISGUISED_PATTERN = /^(?:sửa|sua|đổi|doi|chỉnh|chinh|edit)\s+(?!thành|thanh|sang|lại|lai|danh\s*mục|ngày|ngay|về|ve)\S+.*\d+\s*(k|nghìn|ngàn|tr|triệu)/i;

@Injectable()
export class RegexEditMatcher {
  match(text: string): EditIntentResult | null {
    const trimmed = text.trim();

    // Anti-pattern: loại bỏ chi tiêu giả dạng sửa (vd: "sửa xe 50k")
    if (EXPENSE_DISGUISED_PATTERN.test(trimmed)) return null;

    // Phải bắt đầu bằng động từ sửa
    if (!EDIT_VERBS.test(trimmed)) return null;

    // Incomplete: chỉ có verb, không có thông tin gì thêm
    if (EDIT_INCOMPLETE_PATTERN.test(trimmed)) {
      return { isEditIntent: true, fields: {}, isIncomplete: true };
    }

    // Date pattern: sửa ngày hôm qua, sửa lại hôm kia...
    const dateMatch = trimmed.match(EDIT_DATE_PATTERN);
    if (dateMatch) {
      const dateRef = dateMatch[1];
      const spentAt = detectDate(dateRef);
      if (spentAt) {
        return { isEditIntent: true, fields: { spentAt }, isIncomplete: false };
      }
      return { isEditIntent: true, fields: {}, isIncomplete: true };
    }

    // Amount with keyword: sửa thành 30k
    const amountMatch = trimmed.match(EDIT_AMOUNT_PATTERN);
    if (amountMatch) {
      const amount = this.normalizeAmount(amountMatch[1], amountMatch[2]);
      return { isEditIntent: true, fields: { amount }, isIncomplete: false };
    }

    // Amount bare: sửa 30k (phải có unit)
    const amountBareMatch = trimmed.match(EDIT_AMOUNT_BARE_PATTERN);
    if (amountBareMatch) {
      const amount = this.normalizeAmount(amountBareMatch[1], amountBareMatch[2]);
      return { isEditIntent: true, fields: { amount }, isIncomplete: false };
    }

    // Category: sửa thành ăn uống, sửa danh mục sang cafe
    const categoryMatch = trimmed.match(EDIT_CATEGORY_PATTERN);
    if (categoryMatch) {
      const fields: EditIntentResult["fields"] = {
        category: categoryMatch[1].trim(),
        note: categoryMatch[1].trim(),
      };
      if (categoryMatch[2]) {
        fields.amount = this.normalizeAmount(categoryMatch[2], categoryMatch[3]);
      }
      return { isEditIntent: true, fields, isIncomplete: false };
    }

    // Fallback: có edit verb + target keyword nhưng không match pattern cụ thể
    if (EDIT_TARGET_KEYWORDS.test(trimmed)) {
      return { isEditIntent: true, fields: {}, isIncomplete: true };
    }

    return null;
  }

  private normalizeAmount(rawNumber: string, unit?: string): number {
    const value = parseFloat(rawNumber.replace(",", "."));
    if (!unit) return value >= 1000 ? value : value * 1000;
    const u = unit.toLowerCase();
    if (u === "k" || u.startsWith("ngh") || u.startsWith("ngà")) return value * 1000;
    if (u === "tr" || u.startsWith("triệu")) return value * 1_000_000;
    return value;
  }
}
