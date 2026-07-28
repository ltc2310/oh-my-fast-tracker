/**
 * Formats the export filename for the Excel report.
 * Pattern: bao-cao-chi-tieu-{dd-MM-yyyy}-{dd-MM-yyyy}.xlsx
 */
export function formatExportFilename(from: Date, to: Date): string {
  const formatDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  return `bao-cao-chi-tieu-${formatDate(from)}-${formatDate(to)}.xlsx`;
}
