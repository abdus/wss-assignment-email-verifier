import express from "express";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import fs from "fs";

const app = express();
const emailRegx = /\S+@\S+\.\S+/;
const port = process.env.PORT || 3000;
const errorLog = fs.createWriteStream(`./logs/error-${Date().toString()}.txt`);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: false }));
app.use(express.static("public"));
app.listen(port, () => console.log(`Listening on ${port}`));

// helper function: verification code generator
function generateCode() {
  return Math.floor(Math.random() * 9000 + 1000);
}

// helper function: email sender
function sendVerificationMail(email, code) {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      host: "mail.cock.li",
      port: 465,
      secure: true,
      auth: {
        user: "switchup@firemail.cc",
        pass: "switchup12345",
      },
    });

    transporter.sendMail(
      {
        from: "SwitchUp <switchup@firemail.cc>",
        to: email,
        subject: `Email Verification`,
        text: `Your Email Verification Code is ${code}`,
      },
      (err, info) => {
        if (err) {
          console.log(err.stack);
          return reject(err.message);
        }

        return resolve(info);
      }
    );
  });
}

// helper function: response model
class Response {
  constructor(error = "", code, data) {
    this.error = error;
    this.code = code;
    this.data = error ? null : data;
  }
}

/* database */
// db connection
mongoose.connect(
  `mongodb://wss:6fae51259ca57ba9d62c52fff5b6163f@168.119.165.57:14275/wss`,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  },
  (err) => {
    if (err) {
      console.log("Mongoose Error: ".err.message);
    }

    console.log("Database Connected");
  }
);

// db model
const emailSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  isVerified: { type: Boolean, required: true, default: false },
  verificationCode: { type: Number, required: true, default: generateCode },
});

const Email = mongoose.model("Email", emailSchema);

// routes
app.post("/api/submit", async (req, res) => {
  const { email } = req.body;

  try {
    if (emailRegx.test(email)) {
      const doc = await Email.findOne({ email });

      if (doc && doc.isVerified) {
        return res
          .status(200)
          .json(new Response(null, "EMAIL_VERIFIED", "email already verified"));
      }

      // email not verified yet
      const data2save = new Email({
        email,
      });
      await data2save.save();
      await sendVerificationMail(data2save.email, data2save.verificationCode);

      return res.json(new Response(null, "CODE_SENT", "success"));
    } else {
      return res.status(400).json(new Response("email is not valid"));
    }
  } catch (err) {
    console.log(err.message);
    errorLog.write(err.stack + "\n\n", "utf-8");

    // duplicate email
    if (err.code === 11000) {
      return res.status(400).json(new Response("duplicte email"));
    }

    return res
      .status(500)
      .json(new Response("internal server error", "INTERNAL_ERROR"));
  }
});

app.post("/api/verify", async (req, res) => {
  try {
    const { email, code } = req.body;
    const doc = await Email.findOne({ email });

    console.log(doc, email, code);

    if (!doc) {
      res.status(400).json(new Response("email not found", "EMAIL_NOTFOUND"));
    }

    if (doc.verificationCode === code) {
      console.log("verified");
      doc.isVerified = true;
      await doc.save();
      return res.json(
        new Response(null, "EMAIL_VERIFIED", "email verified successfully")
      );
    } else {
      return res
        .status(400)
        .json(new Response("incorrect verification code", "INCORRECT_CODE"));
    }
  } catch (err) {
    console.log(err.message);
    errorLog.write(err.stack + "\n\n", "utf-8");
  }
});
