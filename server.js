require("dotenv").config();
const multer = require("multer");
const pdfParse = require("pdf-parse");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();

const Application = require("./models/Application");

app.use(cors());
app.use(express.json());

/* -------------------- GROQ SETUP -------------------- */
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/* -------------------- MONGODB CONNECT -------------------- */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.log(err));

/* -------------------- HOME ROUTE -------------------- */
app.get("/", (req, res) => {
  res.send("Backend Running");
});

/* -------------------- CRUD -------------------- */
app.post("/add", async (req, res) => {
  try {
    const data = await Application.create(req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/applications", async (req, res) => {
  try {
    const data = await Application.find();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/update/:id", async (req, res) => {
  try {
    await Application.findByIdAndUpdate(req.params.id, req.body);
    res.json({ message: "Updated Successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/delete/:id", async (req, res) => {
  try {
    await Application.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted Successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* -------------------- STATS -------------------- */
app.get("/stats", async (req, res) => {
  try {
    const total = await Application.countDocuments();
    const applied = await Application.countDocuments({ status: "Applied" });
    const pending = await Application.countDocuments({ status: "Pending" });
    const selected = await Application.countDocuments({ status: "Selected" });

    res.json({ total, applied, pending, selected });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* -------------------- IMPROVE RESUME -------------------- */
app.post("/analyze-resume", async (req, res) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText || resumeText.length < 30) {
      return res.status(400).json({
        message: "Invalid resume text"
      });
    }

    const chat = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `
You are an expert ATS resume analyzer.

Analyze the resume carefully and give an ATS score from 0 to 100.

Evaluate:
- Resume structure
- Technical skills
- Projects
- Experience
- Education
- Relevant keywords
- Quantifiable achievements
- ATS readability
- Professional wording

Do NOT automatically give a high score.
A typical student resume should usually score between 50 and 85.

Return ONLY valid JSON in exactly this format:

{
  "score": 75,
  "strengths": [
    "strength 1",
    "strength 2",
    "strength 3"
  ],
  "weaknesses": [
    "weakness 1",
    "weakness 2",
    "weakness 3"
  ],
  "missingKeywords": [
    "keyword 1",
    "keyword 2",
    "keyword 3"
  ],
  "suggestions": [
    "suggestion 1",
    "suggestion 2",
    "suggestion 3"
  ]
}
`
        },
        {
          role: "user",
          content: `Analyze this resume:\n\n${resumeText}`
        }
      ],
   model: "openai/gpt-oss-20b",
      temperature: 0.2
    });

    const content = chat.choices[0].message.content;

    const analysis = JSON.parse(content);

    res.json(analysis);

  } catch (error) {
    console.log("ATS ERROR:", error);

    res.status(500).json({
      message: "Failed to analyze resume"
    });
  }
});
app.post("/improve-resume", async (req, res) => {
  try {
    const { resumeText, atsAnalysis } = req.body;

    if (!resumeText || resumeText.length < 30) {
      return res.status(400).json({
        message: "Invalid resume text"
      });
    }

    const analysisContext = atsAnalysis
      ? `
ATS ANALYSIS OF THE ORIGINAL RESUME:

Strengths:
${(atsAnalysis.strengths || []).join("\n- ")}

Weaknesses:
${(atsAnalysis.weaknesses || []).join("\n- ")}

Missing Keywords:
${(atsAnalysis.missingKeywords || []).join("\n- ")}

Suggestions:
${(atsAnalysis.suggestions || []).join("\n- ")}
`
      : "No previous ATS analysis was provided.";

    const chat = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `
You are an expert resume editor and ATS optimization specialist.

Your job is to improve the candidate's resume based on the original resume AND the ATS analysis provided.

IMPORTANT RULES:

1. NEVER invent facts.
2. NEVER invent companies, internships, jobs, certifications, technologies, responsibilities, achievements, awards, projects, or experience.
3. NEVER invent numbers, percentages, metrics, users, performance improvements, accuracy values, or other quantitative claims.
4. Preserve all factual information from the original resume.
5. Fix the weaknesses identified by the ATS analysis whenever possible without inventing information.
6. Incorporate missing keywords ONLY when they are genuinely supported by the candidate's existing experience, skills, projects, education, or certifications.
7. Apply the ATS suggestions when they can be implemented truthfully.
8. Use strong professional action verbs.
9. Improve clarity, grammar, consistency, and conciseness.
10. Keep the resume appropriate for a college student / entry-level software developer.
11. Do not add fake professional experience.
12. Do not add a summary containing claims that are not supported by the original resume.
13. Keep existing metrics if they are present in the original resume.
14. Do not create new metrics.
15. Return ONLY the improved resume text.
16. Use clean Markdown formatting with:
   - # for the candidate name
   - ## for major sections
   - **bold** for important titles
   - - for bullet points
17. Do NOT include explanations about what you changed.

${analysisContext}
`
        },
        {
          role: "user",
          content: `
Improve this resume using the ATS analysis above.

ORIGINAL RESUME:

${resumeText}
`
        }
      ],
      model: "openai/gpt-oss-20b",
      temperature: 0.2
    });

    res.json({
      improvedResume: chat.choices[0].message.content
    });

  } catch (error) {
    console.log("IMPROVE RESUME ERROR:", error);

    res.status(500).json({
      message: error.message
    });
  }
});
/* -------------------- QUESTIONS -------------------- */
app.post("/generate-questions", async (req, res) => {
  try {
    const { resumeText, role } = req.body;

    if (!resumeText || resumeText.length < 30) {
      return res.status(400).json({
        message: "Please provide a valid resume"
      });
    }

    const chat = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `
You are an expert technical interviewer.

Generate personalized interview questions based ONLY on the candidate's resume and target role.

Target Role:
${role || "Software Developer"}

Create exactly 9 questions:

3 Technical Questions
- Based on technologies, programming languages, databases, frameworks, or concepts mentioned in the resume.

3 Project Questions
- Based specifically on projects mentioned in the resume.
- Ask about architecture, implementation, challenges, decisions, or technologies used.

3 Behavioral / HR Questions
- Relevant to an entry-level software developer.
- When possible, connect them to the candidate's projects, education, or experience.

IMPORTANT:
- Do not invent experience that is not present in the resume.
- Do not ask about technologies that are completely unrelated to the resume.
- Make the questions realistic for an interview.
- Vary the difficulty.
- Return ONLY the questions.
- Clearly divide them into these sections:

TECHNICAL QUESTIONS
PROJECT QUESTIONS
BEHAVIORAL / HR QUESTIONS
`
        },
        {
          role: "user",
          content: `
Target Role: ${role || "Software Developer"}

Candidate Resume:
${resumeText}
`
        }
      ],
      model: "openai/gpt-oss-20b",
      temperature: 0.5
    });

    res.json({
      questions: chat.choices[0].message.content
    });

  } catch (error) {
    console.log("QUESTION GENERATION ERROR:", error);

    res.status(500).json({
      message: error.message
    });
  }
});

/* -------------------- PDF UPLOAD -------------------- */
app.post("/upload-resume", upload.single("file"), async (req, res) => {
  try {
    console.log("REQ.FILE:", req.file); // 👈 MUST SEE THIS

    if (!req.file) {
      console.log("NO FILE RECEIVED ❌");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const pdfData = await pdfParse(req.file.buffer);

    console.log("TEXT LENGTH:", pdfData.text.length);

    res.json({ text: pdfData.text });

  } catch (error) {
    console.log("ERROR:", error);
    res.status(500).json({ message: "Error reading PDF" });
  }
});

/* -------------------- SERVER -------------------- */
app.listen(5000, () => {
  console.log("Server running on port 5000");
});