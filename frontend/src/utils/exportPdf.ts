import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export const exportPdf = async (
  elementId: string,
  fileName = "salesai-report.pdf"
): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error("Element topilmadi");
    }

    const canvas = await html2canvas(element, {
      backgroundColor: "#0f0f1a",
      scale: 2,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
    const finalWidth = imgWidth * ratio;
    const finalHeight = imgHeight * ratio;

    pdf.addImage(imgData, "PNG", 0, 0, finalWidth, finalHeight);
    pdf.save(fileName);
  } catch (err) {
    console.error("PDF export error:", err);
    throw new Error("PDF yaratishda xatolik");
  }
};
