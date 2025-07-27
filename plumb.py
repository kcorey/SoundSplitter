import pdfplumber
with pdfplumber.open("/Volumes/PS2000W/Toastmasters/20250709/Spa Speaker Agenda - President handover (1).pdf") as pdf:
    page = pdf.pages[0]
    table = page.extract_table()
    for row in table:
        print(row[2])  # Third column
