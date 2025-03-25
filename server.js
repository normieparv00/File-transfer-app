const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use a service role key
const supabase = createClient(supabaseUrl, supabaseKey);

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// File upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const file = req.file;
        const filePath = `uploads/${Date.now()}_${file.originalname}`; // Organizing files inside 'uploads/' folder

        const { data, error } = await supabase.storage
            .from("user-uploads") // Your Supabase bucket name
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false, // Avoid overwriting existing files
            });

        if (error) {
            console.error("Upload failed:", error);
            return res.status(500).json({ error: error.message });
        }

        // Get public URL of the uploaded file
        const { data: publicUrlData } = supabase.storage.from("user-uploads").getPublicUrl(filePath);

        res.json({ message: "File uploaded successfully", fileUrl: publicUrlData.publicUrl });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});