#!/usr/bin/env python3
import pdfplumber
import json
import sys

def extract_presenters_from_pdf(pdf_path):
    presenters = []
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                print(f"Processing page {page_num + 1}...")
                
                # Try to extract tables first
                tables = page.extract_tables()
                
                if tables:
                    for table_num, table in enumerate(tables):
                        print(f"  Found table {table_num + 1} with {len(table)} rows")
                        
                        for row_num, row in enumerate(table):
                            if row and len(row) >= 3:
                                # Clean up the third column (Presenter)
                                presenter = row[2].strip() if row[2] else ""
                                
                                # Skip empty entries and headers
                                if presenter and presenter.lower() not in ['presenter', 'time', 'role', 'event']:
                                    # Skip entries that look like times or durations
                                    if not presenter.replace(':', '').replace('.', '').isdigit():
                                        # Skip specific header entries
                                        if presenter.lower() not in ['starting at:', 'theme: our super']:
                                            presenters.append({
                                                'presenter': presenter,
                                                'page': page_num + 1,
                                                'row': row_num + 1
                                            })
                                            print(f"    Found presenter: {presenter}")
                
                # If no tables found, try to extract text and parse manually
                if not tables:
                    text = page.extract_text()
                    if text:
                        print(f"  No tables found, extracting text manually...")
                        lines = text.split('\n')
                        
                        for line_num, line in enumerate(lines):
                            # Split on multiple spaces to find columns
                            parts = line.split('  ')
                            parts = [p.strip() for p in parts if p.strip()]
                            
                            if len(parts) >= 3:
                                presenter = parts[2]
                                if presenter and presenter.lower() not in ['presenter', 'time', 'role', 'event']:
                                    if not presenter.replace(':', '').replace('.', '').isdigit():
                                        # Skip specific header entries
                                        if presenter.lower() not in ['starting at:', 'theme: our super']:
                                            presenters.append({
                                                'presenter': presenter,
                                                'page': page_num + 1,
                                                'row': line_num + 1
                                            })
                                            print(f"    Found presenter: {presenter}")
    
    except Exception as e:
        print(f"Error processing PDF: {e}")
        return []
    
    return presenters

def main():
    pdf_file = "Spa Speaker Agenda - President handover (1).pdf"
    
    print(f"Extracting presenters from {pdf_file}...")
    presenters = extract_presenters_from_pdf(pdf_file)
    
    if presenters:
        print(f"\nFound {len(presenters)} presenters:")
        for p in presenters:
            print(f"  - {p['presenter']} (Page {p['page']}, Row {p['row']})")
        
        # Save to JSON file for the Go server to use
        with open('extracted_presenters.json', 'w') as f:
            json.dump(presenters, f, indent=2)
        print(f"\nSaved presenters to extracted_presenters.json")
    else:
        print("No presenters found in the PDF.")

if __name__ == "__main__":
    main()
