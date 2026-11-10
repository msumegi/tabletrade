# Range Path

Hidden demo at `/demos/range-path/`. It stays `noindex`, unlinked from the public homepage, and out of any sitemap.

Courses are separate pages: catalogue, course, lesson, quiz, and certificate. Progress and quiz scores stay on the device. The final quiz pass mark is 70%. A pass opens a sample completion certificate.

## Add a course

1. Convert the markdown file:

   ```bash
   node tools/md-to-course.mjs path/to/course.md
   ```

   This writes `data/courses/<slug>.json`. It keeps the lesson text, official links, and quiz answers from the file. It does not invent facts. If a lesson has no quiz, it writes true/false questions from that lesson’s own sentences and prints a warning.

2. Add one entry to `data/registry.json`, in the place you want it in the catalogue:

   ```json
   { "slug": "your-slug", "shortTitle": "Short name", "navLabel": "Nav", "featured": true }
   ```

   Set `"extra": true` and `"featured": false` for a demo extra. Extra courses stay available, are listed after the main courses, and are not shown on the home page. Registry order is the catalogue order. How to Learn Online sits after the first four courses because it is a starter for taking an online course.

3. Rebuild the pages:

   ```bash
   node tools/build-pages.mjs
   ```

The registry drives the home page, catalogue, course pages, quizzes, progress, and certificates. Edit the JSON, not the generated HTML. `assets/catalogue.js` is generated too.

Check links, the footer disclaimer, `noindex`, and quiz answers with:

```bash
node tools/check-demo.mjs
```

## What the converter keeps back

These stay in the JSON for authors and are not shown to learners:

- The disclaimer at the top of a source file. Every learning page already shows the existing Range Path disclaimer once, in the footer.
- “About N words” lines.
- “Content notes for builders”.

The certificate uses the source line that starts with “It is not…”.
