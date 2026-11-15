# Portal upload rules

Upload rules for the five exam portals planned for FormReady v1, taken from each
body's own notice or portal page. Every figure below was read from the official
document linked in that section on **15 November 2026**. Nothing here comes from
coaching sites or resizer tools, which disagree with each other and with the
official text.

Rules change every cycle. Before a preset ships, re-check its source link and
record the date in the preset ("rules as of").

"Not stated" means the official source gives no figure. It does not mean there
is no limit.

## Summary

| Exam | Photo | Signature | Documents | File naming |
| --- | --- | --- | --- | --- |
| SSC (CGL 2026) | Live capture only, no file upload | JPEG/JPG, 10–20 KB, about 6.0 × 2.0 cm (see conflict) | Not stated | Not stated |
| UPSC (CSE 2026) | JPG, 20–200 KB, plus live capture | JPG, 20–100 KB, 350–500 px, three signatures in one image | PDF 50–300 KB; photo ID JPG 20–200 KB | Exact names required |
| NTA NEET (UG) 2026 | JPG/JPEG, 10–200 KB, plus live capture | JPG/JPEG, 10–100 KB | PDF 50–300 KB | Not stated |
| NTA JEE (Main) 2027 | JPG/JPEG, 10–200 KB, plus live capture | JPG/JPEG, 10–100 KB | PDF 50–300 KB | Not stated |
| IBPS (CRP PO/MT-XVI) | 200 × 230 px, 20–50 KB, plus live capture | 140 × 60 px, 10–20 KB | PDF, A4, up to 500 KB | Not required (example only) |
| UPSSSC | JPG/JPEG, 3.5 × 4.5 cm, 50–100 KB (see conflict) | JPG/JPEG, 3.5 × 1.5 cm, 20–50 KB (see conflict) | Not stated | Not stated |

## SSC

- **Source:** Notice, Combined Graduate Level Examination, 2026, dated 21-05-2026
  (132 pages). The file name says 2025 but the notice is for CGL 2026.
  <https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_cgl_2025.pdf>
- **Cycle:** applications 21.05.2026 to 22.06.2026 (closed).

| Item | Rule | Where |
| --- | --- | --- |
| Photograph | Not uploaded as a file. The application module captures a live photo by webcam or mobile device. A photo of an existing photograph is rejected. No cap, mask or spectacles; plain background; full frontal view. | Para 9.4–9.5; Annexure IV, Part II, item 1 |
| Signature | Scanned, JPEG/JPG, 10 to 20 KB. Blurred or miniature signatures are rejected. | Para 9.6; Annexure IV, Part II, item 1(b) |
| Signature dimensions | "About 6.0 cm (width) x 2.0 cm (height)" in para 9.6. "About 4.0 cm (Width) x 2.0 cm (Height)" in Annexure IV. | See conflict below |
| Pixel dimensions | Not stated | |
| Documents at One Time Registration | Candidates without Aadhaar upload proof of name, date of birth, address and gender, and a photograph. No format or size is given. | Annexure III, Part A (One-Time Registration) |
| File naming | Not stated | |

**Conflict:** the same notice gives the signature width as 6.0 cm in para 9.6 and
4.0 cm in Annexure IV. Height is 2.0 cm in both.

**For FormReady:** the photo tool does not apply to SSC. Only the signature
tool does.

## UPSC

- **Sources:** the notice gives no sizes and points to the portal instructions.
  - Examination Notice No. 05/2026-CSE, dated 04.02.2026 (Notes 2 and 3):
    <https://www.upsc.gov.in/sites/default/files/Notif-CSP-2026-Engl-060226Rev.pdf>
  - "Instructions for uploading the photo & signature" (undated), on the portal
    under Instructions and FAQs > Instructions for filling the form > Photo & Signature:
    <https://upsconline.nic.in/candidate/resources/bzh30/login/upsc-candidates-portal/dist/assets/instruction-photo-signature-upload-upsc-CCLCIgId.pdf>
  - "Instructions for uploading documents" (undated), under Instructions and FAQs:
    <https://upsconline.nic.in/candidate/resources/bzh30/login/upsc-candidates-portal/dist/assets/Instructions%20for%20uploading%20documents-new-2-CFBYTKvU.pdf>
- The two portal links contain build hashes and will break when the portal is
  rebuilt. The stable route is <https://upsconline.nic.in> and the menu path above.
- **Cycle:** CSE 2026 applications closed 24.02.2026. The portal instructions
  apply to all UPSC examinations.

| Item | Format | Size | File name | Other rules |
| --- | --- | --- | --- | --- |
| Photo | jpg | 20KB–200KB | `photo` | Face covers at least 75% of the photo; plain white background; both ears visible; colour; not signed. Pixel size not stated. |
| Live photograph | Captured in the form | | | Mandatory. Matched against the uploaded photo. |
| Signature | jpg | 20 KB–100 KB | `signature` | Three signatures, one below the other, black ink, plain white paper, one image. "Image dimensions: 350 - 500 pixels". |
| Photo ID (Aadhaar / photo ID) | jpg | 20KB–200KB | `id_card` | |
| Matriculation board / equivalent certificate | pdf | 50KB–300KB | `board_certificate` | |
| Name change affidavit / gazette notification | pdf | 50KB–300KB | `name_change` | |
| Caste certificate | pdf | 50KB–300KB | `caste_certificate` | |
| Disability certificate | pdf | 50KB–300KB | `disability_certificate` | |
| PwD / PwBD recommendation certificate | pdf | 50KB–300KB | `pw_recommendation` | |

The document table also lists EPFO-examination items (`bachelor_marksheet`,
`bachelor_certificate`, `scribe_photo`, `scribe_signature`,
`writing_extremity_certificate`, `age_relaxation_certificate`,
`assistive_device`) with the same size bands.

File names are enforced: "Document will not be uploaded if any other file name,
format or size is used."

**Unclear:** "350 - 500 pixels" for the signature does not say whether it means
width, height or both.

## NTA: NEET (UG) 2026

- **Source:** Information Bulletin NEET (UG)-2026, Chapter 3, Step 2, item (d), pages 15–16.
  <https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/02/202602231394640855.pdf>
  (listed at <https://neet.nta.nic.in/document/information-bulletin-english/>)
- **Cycle:** applications 08 February 2026 to 08 March 2026 per the bulletin (closed).
  The NEET (UG) 2027 bulletin was not on the site when this was checked.

| Item | Format | Size | Other rules |
| --- | --- | --- | --- |
| Passport size photograph | JPG/JPEG | 10 kb to 200 kb | Taken after 01 January 2026. Colour or black & white, white background, 80% face including ears, no mask. Dimensions not stated. |
| Live photograph | Captured in the form | | Webcam or QR code to a mobile device. |
| Signature | JPG/JPEG | 10 kb to 100 kb | |
| Left and right hand fingers and thumb impressions | JPG/JPEG | 10 kb to 200 kb (see conflict) | |
| Identity proof (non-Aadhaar / non-DigiLocker verification) | JPG/JPEG | 10 kb to 200 kb (see conflict) | |
| Class X certificate, Class X marks-sheet, CGPA conversion certificate | pdf | 50 kb to 300 kb | |
| Category certificate | pdf | 50 kb to 300 kb | |
| PwD/PwBD/UDID certificate | pdf | 50 kb to 300 kb | |
| Address proof (present and permanent) | pdf | 50 kb to 300 kb | |
| NRI / OCI / foreigner documentary proof | pdf | 50 kb to 300 kb | |
| File naming | | | Not stated |

**Conflicts inside the bulletin:**

- Finger and thumb impressions are "10 kb to 200 kb" in item (d)(iii), but the
  later paragraph on the same uploads says "File size must be between 50 kb to 300 kb".
- Identity proof is "10 kb to 200 kb" in item (d)(viii) and "50 kb to 300 kb" in item (d)(xv).

The post card size (4"×6") photograph is something candidates must keep for the
exam centre and counselling. It is not in the list of uploads.

## NTA: JEE (Main) 2027

- **Source:** Information Bulletin, Joint Entrance Examination (Main) - 2027,
  Step 2: Application Form, pages 7–8.
  <https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2026/10/202610241890224107.pdf>
  (listed at <https://jeemain.nta.nic.in/document/information-bulletin/>)
- **Cycle:** Session 1 (January 2027) applications 24 October 2026 to
  22 November 2026. This one is open now.

| Item | Format | Size | Other rules |
| --- | --- | --- | --- |
| Passport size photograph | JPG/JPEG | 10 kB to 200 kB | Recent, colour, white background, 80% face including ears, no mask. Dimensions not stated. |
| Live photograph | Captured in the form | | Webcam or QR code to a mobile device. |
| Signature | JPG/JPEG | 10 kB to 100 kB | |
| Class 10 or equivalent certificate / marks-sheet | pdf | 50 kB to 300 kB | |
| Disability / UDID certificate | pdf | 50 kB to 300 kB | |
| Certificate of physical limitation to write | pdf | 50 kB to 300 kB | |
| Non-Indian passport | pdf | 50 kB to 300 kB | |
| File naming | | | Not stated |

## IBPS

- **Source:** Notification CRP PO/MT-XVI, dated 30.06.2026, Annexure III
  "Guidelines for Scanning and Upload Of Documents", pages 36–38.
  <https://www.ibps.in/wp-content/uploads/Detailed-Notification_CRP-PO-XVI_Final_V1_30.06.2026.pdf>
- **Cycle:** online registration 01-07-2026 to 21-07-2026 (closed). Clerk, RRB and
  SO notifications carry their own annexure and were not checked here.

| Item | Format | Dimensions | Size | Other rules |
| --- | --- | --- | --- | --- |
| Photograph | JPG or JPEG | 4.5cm × 3.5cm; 200 x 230 pixels (preferred) | 20kb–50 kb | Recent passport-style colour photo; light, preferably white, background; no caps, hats or dark glasses. |
| Live photograph | Captured in the form | | | Required in addition to the uploaded photo; webcam or QR code to a mobile phone. |
| Signature | JPG or JPEG | 140 x 60 pixels (preferred) | 10kb–20kb | White paper, black ink pen. Not in capital letters. |
| Left thumb impression | jpg / jpeg | 240 x 240 pixels in 200 DPI, i.e. 3 cm × 3 cm | 20 KB–50 KB | White paper, black or blue ink. |
| Handwritten declaration | jpg / jpeg | 800 x 400 pixels in 200 DPI, i.e. 10 cm × 5 cm | 50 KB–100 KB | In the candidate's handwriting, in English only, black ink on white paper, not in capital letters. |
| 10th certificate, and the Clause J (ix) certificate (limitation to write, for candidates needing a scribe) | PDF | A4 page size | Not exceeding 500 KB | Clear and readable. |

Scanner settings in the annexure: minimum 200 dpi, True Colour.

Declaration text: "I, __________ (Name of the candidate), hereby declare that all
the information submitted by me in the application form is correct, true and
valid. I will present the supporting documents as and when required."

File naming is not enforced. The annexure only gives `image01.jpg` as an example.
The portal blocks progress until photo and signature meet the specification.

## UPSSSC

- **Source:** "GuideLines for Scanning Photograph with Signature", an undated page
  on the commission's site. It names no advertisement or year.
  <https://upsssc.gov.in/GuidLineUploadPhoto.htm>
- No current PET advertisement or newer upload instruction was linked from the
  home page when this was checked. Treat these figures as the least certain of
  the five.

| Item | Format | Dimensions | Size | Other rules |
| --- | --- | --- | --- | --- |
| Photograph | .jpe, .jpeg, .jpg | 3.5 cm width, 4.5 cm height | 50KB to 100KB (see conflict) | Scan only the photo area, not the whole page. |
| Signature | .jpe, .jpeg, .jpg | 3.5 cm width, 1.5 cm height | 20KB to 50KB (see conflict) | Full signature, not initials; not in capital letters; signed by the applicant. |
| Pixel dimensions | | Not stated | | The page's sample uses 200 dpi, True Colour. |
| Documents, file naming | | | Not stated | |

**Conflict:** point 4 of the page says photo 50KB to 100KB and signature 20KB to
50KB. Point 5 says to adjust the scanner "if the size of the file is more than
20 KB", and the sample specification at the bottom says photo "< 50 KB" and
signature "< 20 KB". The page contradicts itself, so the live form's own
validation message is the only reliable check.

## Open questions before writing presets

1. **SSC signature width:** 6.0 cm or 4.0 cm. Check what the live form accepts.
2. **UPSC signature "350 - 500 pixels":** which side this applies to.
3. **NEET thumb impressions and identity proof:** which of the two size bands the form enforces.
4. **UPSSSC sizes:** which of the three sets of figures the form enforces, and
   whether a current advertisement changes them.
5. **Pixel sizes where only cm is given** (SSC signature, UPSSSC photo and
   signature): the sources state no DPI requirement, so any pixel target is
   FormReady's own choice and should be labelled that way.
6. **IBPS Clerk, RRB and SO, and other SSC exams (CHSL, GD, MTS):** not checked.
   Do not assume they match PO/MT and CGL.
