document.getElementById('pdfForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('pdfFile');
    const numCopies = parseInt(document.getElementById('numCopies').value);
    const codeTemplate = document.getElementById('codeTemplate').value;
    const singlePdf = document.getElementById('singlePdf').checked;
    const generateBtn = document.getElementById('generateBtn');
    const progress = document.getElementById('progress');
    const progressText = document.getElementById('progressText');
    const downloadLink = document.getElementById('downloadLink');
    const downloadBtn = document.getElementById('downloadBtn');

    if (!fileInput.files[0]) {
        alert('Выберите PDF файл');
        return;
    }

    // Парсим шаблон
    const templateMatch = codeTemplate.match(/^(.*)\{(.+)\}(.*)$/);
    if (!templateMatch) {
        alert('Неверный формат шаблона. Используйте формат: PREFIX{START}SUFFIX');
        return;
    }
    const prefix = templateMatch[1];
    const startStr = templateMatch[2];
    const suffix = templateMatch[3];
    const startNum = parseInt(startStr);
    const width = startStr.length;

    if (isNaN(startNum) || startNum < 0) {
        alert('Стартовое число должно быть положительным целым числом');
        return;
    }

    generateBtn.disabled = true;
    progress.style.display = 'block';
    downloadLink.style.display = 'none';

    try {
        const originalPdfBytes = await fileInput.files[0].arrayBuffer();

        if (singlePdf) {
            // Генерируем один большой PDF
            const singlePdfBlob = await generateSinglePDF(originalPdfBytes, numCopies, prefix, startNum, width, suffix, progressText);
            const pdfUrl = URL.createObjectURL(singlePdfBlob);

            downloadBtn.href = pdfUrl;
            downloadBtn.download = prefix + 'series.pdf';
            downloadBtn.textContent = 'Скачать PDF';
        } else {
            // Генерируем ZIP с отдельными PDF
            const zip = new JSZip();

            for (let i = 0; i < numCopies; i++) {
                progressText.textContent = `${i + 1}/${numCopies}`;

                const currentNum = startNum + i;
                const numStr = currentNum.toString().padStart(width, '0');
                const serialNumber = prefix + numStr + suffix;

                // Генерируем QR-код
                const qrDataUrl = await generateQR(serialNumber);

                // Модифицируем PDF
                const modifiedPdfBytes = await modifyPDF(originalPdfBytes, serialNumber, qrDataUrl);

                // Добавляем в ZIP
                zip.file(`${serialNumber}.pdf`, modifiedPdfBytes);
            }

            // Создаем ZIP файл
            const zipBlob = await zip.generateAsync({type: 'blob'});
            const zipUrl = URL.createObjectURL(zipBlob);

            downloadBtn.href = zipUrl;
            downloadBtn.download = prefix + 'series.zip';
            downloadBtn.textContent = 'Скачать ZIP с PDF';
        }

        downloadLink.style.display = 'block';
        progress.style.display = 'none';
        generateBtn.disabled = false;

    } catch (error) {
        console.error(error);
        alert('Ошибка при генерации: ' + error.message);
        progress.style.display = 'none';
        generateBtn.disabled = false;
    }
});

async function generateQR(text) {
    const qr = new QRious({
        value: text,
        size: 21,
        level: 'H'
    });
    return qr.toDataURL();
}

async function generateSinglePDF(originalPdfBytes, numCopies, prefix, startNum, width, suffix, progressText) {
    const newPdfDoc = await PDFLib.PDFDocument.create();
    const originalPdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
    const font = await newPdfDoc.embedStandardFont(PDFLib.StandardFonts.Helvetica);

    for (let i = 0; i < numCopies; i++) {
        progressText.textContent = `${i + 1}/${numCopies}`;

        const currentNum = startNum + i;
        const numStr = currentNum.toString().padStart(width, '0');
        const serialNumber = prefix + numStr + suffix;

        // Генерируем QR-код
        const qrDataUrl = await generateQR(serialNumber);

        // Извлекаем PNG данные из data URL
        const base64 = qrDataUrl.split(',')[1];
        const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        // Загружаем QR как изображение
        const qrImage = await newPdfDoc.embedPng(pngBytes);

        // Размер QR: 2 см = 56.69 пунктов (при 72 DPI)
        const qrSize = 56.69;

        // Копируем все страницы из оригинального PDF
        // Копируем все страницы из оригинального PDF
        const originalPages = originalPdfDoc.getPages();
        for (let i = 0; i < originalPages.length; i++) {
            const originalPage = originalPages[i];
            const size = originalPage.getSize();
            let page;
            if (isNaN(size.width) || isNaN(size.height) || size.width <= 0 || size.height <= 0) {
                // Если размер страницы недействителен, добавляем пустую страницу A4
                page = newPdfDoc.addPage([595.28, 841.89]);
            } else {
                const [copiedPage] = await newPdfDoc.copyPages(originalPdfDoc, [i]);
                page = newPdfDoc.addPage(copiedPage);
            }

            const { width: pageWidth, height: pageHeight } = page.getSize();

            // Позиция: верхний правый угол, с отступом
            const qrX = pageWidth - qrSize - 32;
            const qrY = pageHeight - qrSize - 32;

            // Рисуем QR
            page.drawImage(qrImage, {
                x: qrX,
                y: qrY,
                width: qrSize,
                height: qrSize,
            });

            // Добавляем текст под QR
            page.drawText(serialNumber, {
                x: qrX + qrSize - font.widthOfTextAtSize(serialNumber, 13),
                y: qrY - 15,
                size: 13,
                font: font,
                color: PDFLib.rgb(0, 0, 0),
            });
        }
    }

    const pdfBytes = await newPdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

async function modifyPDF(pdfBytes, serialNumber, qrDataUrl) {
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedStandardFont(PDFLib.StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    // Извлекаем PNG данные из data URL
    const base64 = qrDataUrl.split(',')[1];
    const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    // Загружаем QR как изображение
    const qrImage = await pdfDoc.embedPng(pngBytes);

    // Размер QR: 2 см = 56.69 пунктов (при 72 DPI)
    const qrSize = 56.69;

    pages.forEach(page => {
        const { width, height } = page.getSize();

        // Позиция: верхний правый угол, с отступом
        const qrX = width - qrSize - 32;
        const qrY = height - qrSize - 32;

        // Рисуем QR
        page.drawImage(qrImage, {
            x: qrX,
            y: qrY,
            width: qrSize,
            height: qrSize,
        });

       // Добавляем текст под QR
        page.drawText(serialNumber, {
            x: qrX + qrSize - font.widthOfTextAtSize(serialNumber, 13),
            y: qrY - 15,
            size: 13,
            font: font,
            color: PDFLib.rgb(0, 0, 0),
        });
    });

    return await pdfDoc.save();
}
