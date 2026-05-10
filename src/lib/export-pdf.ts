import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export async function exportDashboardToPdf(element: HTMLElement, fileName: string) {
  // Resolve CSS color variables to concrete RGB so html2canvas (which doesn't
  // understand oklch / color-mix) renders correctly.
  const bg = getComputedStyle(document.body).backgroundColor || "#0b1220";

  const canvas = await html2canvas(element, {
    backgroundColor: bg,
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    pdf.addPage();
    position = margin - (imgHeight - heightLeft);
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  pdf.save(fileName);
}
