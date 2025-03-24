require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const path = require("path");
const fileUpload = require("express-fileupload");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(fileUpload());

// ✅ Load MongoDB Connection URI from .env
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ MONGO_URI is not set in .env");
    process.exit(1);
}

// ✅ Connect to MongoDB using Mongoose
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    });

const conn = mongoose.connection;

let gridFSBucket;
conn.once("open", async () => {
    gridFSBucket = new GridFSBucket(conn.db, { bucketName: "uploads" });
    console.log("📁 GridFS Initialized");

    // ✅ Create TTL Index (Deletes files after 3 minutes)
    await conn.db.collection("uploads.files").createIndex(
        { "metadata.uploadDate": 1 },
        { expireAfterSeconds: 180 } // ✅ Set to 3 minutes (180 seconds)
    );

    console.log("⏳ TTL Index Set: Files will auto-delete after 3 minutes");
});

// ✅ Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Handle File Upload
app.post("/upload", (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;
    const fileCode = Math.floor(100000 + Math.random() * 900000).toString(); // ✅ Always a 6-digit number
    const fileName = `${fileCode}-${file.name}`;

    const uploadStream = gridFSBucket.openUploadStream(fileName, {
        metadata: { uploadDate: new Date() }, // ✅ Store upload date for TTL deletion
    });

    uploadStream.end(file.data);

    uploadStream.on("finish", () => {
        res.json({ fileCode }); // ✅ Return the 6-digit code
    });

    uploadStream.on("error", (err) => {
        res.status(500).json({ error: err.message });
    });
});

// ✅ Handle File Download
app.get("/download/:code", async (req, res) => {
    const fileCode = req.params.code;
    try {
        const files = await conn.db.collection("uploads.files").find({ filename: new RegExp(`^${fileCode}-`) }).toArray();
        if (!files.length) return res.status(404).json({ error: "File not found" });

        const file = files[0];
        const originalFileName = file.filename.replace(/^\d{6}-/, ''); // ✅ Preserve original filename and extension

        res.set("Content-Disposition", `attachment; filename="${originalFileName}"`);
        res.set("Content-Type", file.contentType || "application/octet-stream"); // ✅ Ensure correct MIME type
        gridFSBucket.openDownloadStream(file._id).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Handle File Deletion (Deletes Only Related Chunks)
app.delete("/delete/:code", async (req, res) => {
    const fileCode = req.params.code;
    try {
        // 🔍 Find the file by fileCode
        const file = await conn.db.collection("uploads.files").findOne({ filename: new RegExp(`^${fileCode}-`) });
        if (!file) return res.status(404).json({ error: "File not found" });

        const fileId = file._id;

        // 🗑 Delete File Metadata from GridFS
        await gridFSBucket.delete(new ObjectId(fileId));

        // 🗑 Delete Only Chunks Related to the File
        await conn.db.collection("uploads.chunks").deleteMany({ files_id: fileId });

        res.json({ success: true, message: "File and related chunks deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));