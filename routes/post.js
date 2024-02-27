const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const requireLogin = require('../middleware/authmain');
const Post = mongoose.model("Post");
const { Readable } = require('stream');

// Array to store connected clients
let clients = [];

// Route to handle client connections for SSE
router.get('/sse/notifications', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  
    // Send an empty response to indicate connection establishment
    res.status(200).end();
  
    // Add client to the array
    clients.push(res);
    console.log(clients);
    // Remove client when connection is closed
    req.on('close', () => {
      clients = clients.filter(client => client !== res);
    });
});

// Function to send SSE to connected clients
function sendSSE(message) {
    const event = `data: ${JSON.stringify(message)}\n\n`;
    clients.forEach(client => {
        client.write(event);
    });
}

// GET all posts
router.get('/allpost', requireLogin, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("postedBy", "_id name")
            .populate("comments.postedBy", "_id name")
            .sort('-createdAt');
        res.json({ posts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Create a new post
router.post('/createpost', requireLogin, async (req, res) => {
    const { title, body, pic } = req.body;
    if (!title || !body || !pic) {
        return res.status(422).json({ error: 'Please add all the fields' });
    }

    try {
        const newPost = new Post({ title, body, photo: pic, postedBy: req.user });
        const savedPost = await newPost.save();

        // Broadcast new post notification via SSE
        sendSSE({ message: `New post "${newPost.title}" by ${req.user.name}` });

        res.json({ post: savedPost });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Like a post
router.put('/like', requireLogin, async (req, res) => {
    try {
        const result = await Post.findByIdAndUpdate(req.body.postId, {
            $push: { likes: req.user._id }
        }, { new: true });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(422).json({ error: err.message });
    }
});

// Unlike a post
router.put('/unlike', requireLogin, async (req, res) => {
    try {
        const result = await Post.findByIdAndUpdate(req.body.postId, {
            $pull: { likes: req.user._id }
        }, { new: true });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(422).json({ error: err.message });
    }
});

// Add a comment to a post
router.put('/comment', requireLogin, async (req, res) => {
    const { text, postId } = req.body;
    const comment = { text, postedBy: req.user._id };
    try {
        const result = await Post.findByIdAndUpdate(postId, {
            $push: { comments: comment }
        }, {
            new: true
        }).populate("comments.postedBy", "_id name")
            .populate("postedBy", "_id name");
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(422).json({ error: err.message });
    }
});

// Delete a post
router.delete('/deletepost/:postId', requireLogin, async (req, res) => {
    try {
        const { postId } = req.params;
        const deletedPost = await Post.findByIdAndDelete(postId);
        if (!deletedPost) {
            return res.status(404).json({ error: "Post not found" });
        }
        // Optionally, you can check if the user is authorized to delete the post
        if (deletedPost.postedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You are not authorized to delete this post" });
        }
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;



// router.get('/mypost',requireLogin,(req,res)=>{
//     Post.find({postedBy:req.user._id})
//     .populate("PostedBy","_id name")
//     .then(mypost=>{
//         res.json({mypost})
//     })
//     .catch(err=>{
//         console.log(err)
//     })
// })
