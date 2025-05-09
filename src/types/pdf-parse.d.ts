declare module 'pdf-parse' {
    interface PDFInfo {
        PDFFormatVersion?: string;
        IsAcroFormPresent?: boolean;
        IsXFAPresent?: boolean;
        IsCollectionPresent?: boolean;
        IsSignaturesPresent?: boolean;
        Creator?: string;
        Producer?: string;
        CreationDate?: string;
        ModDate?: string;
        Title?: string;
        Author?: string;
        Subject?: string;
        Keywords?: string;
        [key: string]: any;
    }

    interface PDFData {
        text: string;
        numpages: number;
        numrender: number;
        info: PDFInfo;
        metadata: any;
        version: string;
    }

    interface PDFOptions {
        pagerender?: (pageData: any) => string;
        max?: number;
    }

    function pdfParse(
        dataBuffer: Buffer,
        options?: PDFOptions
    ): Promise<PDFData>;

    export = pdfParse;
}
