export interface EditIntentResult {
  isEditIntent: true;
  fields: {
    amount?: number;      // VND amount đã normalize
    category?: string;    // raw text mô tả danh mục (chưa detect thành category chuẩn)
    note?: string;        // text gốc sếp nhập
    spentAt?: Date;       // ngày tính từ tham chiếu tương đối
  };
  isIncomplete: boolean;  // true khi có edit verb nhưng không trích xuất được field nào
}

export interface EditIntentDetector {
  /**
   * Phân tích message để xác định có phải ý định sửa giao dịch hay không.
   * @returns EditIntentResult nếu là edit intent, null nếu không phải
   */
  detect(text: string): Promise<EditIntentResult | null>;
}
