const express = require("express");
const socket = require("socket.io");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
const http = require("http");
const server = http.createServer(app);
const io = socket(server, {
  cors: {
    origin: "*",
  },
});
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,X-Access-Token,XKey,Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    return res.status(200).json({});
  }

  next();
});
const schedule = {};
const room = {};
const idToRoom = {};
const roomToId = {};
const mutedMentor = {};
const videoMute = {};
//student
const studentConnectedTo = {};
const studentIdToUuid = {};
const UuidToStudentId = {};
// const mentorStaticId = {};

//start
io.on("connection", (socket) => {
  socket.on("mentor start class", async (payload) => {
    const { mentorId, scheduleID } = payload;
    // console.log(room[mentorId]);
    if (room?.[mentorId]?.length > 0 && schedule[mentorId] === scheduleID) {
      await room[mentorId].forEach((userUUid) => {
        const makeSoId = UuidToStudentId[userUUid];
        socket.emit("student want to connect", {
          studentId: makeSoId,
        });
      });
    } else {
      room[mentorId] = [];

      schedule[mentorId] = scheduleID;
      idToRoom[socket.id] = mentorId;
      roomToId[mentorId] = socket.id;
      mutedMentor[mentorId] = true;
      videoMute[mentorId] = true;
    }
  });
  // medil start
  socket.on("mentor refresh try", (payload) => {
    const { mentorUui } = payload;
    delete roomToId[mentorUui];
    roomToId[mentorUui] = socket.id;
    if (roomToId[mentorUui]) {
      // console.log("mentor id");
      delete idToRoom[roomToId[mentorUui]];
      idToRoom[socket.id] = mentorUui;

      socket.emit("already have", "data");
    }
  });

  socket.on("after refresh", (payload) => {
    const { roomRef } = payload;

    if (room[roomRef]) {
      room[roomRef].forEach((key) => {
        socket.emit("student want to connect", {
          studentId: UuidToStudentId[key],
        });
      });
    }
  });
  // join section2
  socket.on("student want to connect", async (payload) => {
    const { mentorUuid, studentUuid, scheduleID } = payload;

    if (UuidToStudentId[studentUuid]) {
      delete studentIdToUuid[UuidToStudentId[studentUuid]];
      studentIdToUuid[socket.id] = studentUuid;
      delete UuidToStudentId[studentUuid];
      UuidToStudentId[studentUuid] = socket.id;
      //change
      if (schedule[mentorUuid] == scheduleID) {
        const mentorSocketId = await roomToId?.[mentorUuid];
        io.to(mentorSocketId).emit("student want to connect", {
          studentId: socket.id,
        });
      } else {
        socket.emit("open dialog", "Your schedule Id does not match");
      }
    } else {
      if (roomToId[mentorUuid] && schedule[mentorUuid] == scheduleID) {
        UuidToStudentId[studentUuid] = socket.id;
        studentIdToUuid[socket.id] = studentUuid;

        room[mentorUuid].push(studentUuid);
        const mentiId = await roomToId?.[mentorUuid];
        io.to(mentiId).emit("student want to connect", {
          studentId: socket.id,
          studentUuid,
        });
      } else {
        if (roomToId[mentorUuid]) {
          //   socket.emit("open dialog", "Your mentor does not start class..");
          // } else {
          socket.emit("open dialog", "Your schedule id does not match..");
        }
      }
    }
  });
  //signal send
  socket.on("sending signal", (payload) => {
    const { userToSignal, signal, uid } = payload;
    studentConnectedTo[studentIdToUuid[userToSignal]] = uid;
    io.to(userToSignal).emit("mentor send to student", {
      mentorFrontId: socket.id,
      mentorSignal: signal,
      muteStatus: mutedMentor[idToRoom[socket.id]],
      videoStatus: videoMute[idToRoom[socket.id]],
    });
  });
  socket.on("returning signal", (payload) => {
    const { signal, mentorFrontId } = payload;

    io.to(mentorFrontId).emit("student signal to mentor", {
      studentSignal: signal,
      id: socket.id,
    });
  });

  socket.on("video mute status", (payload) => {
    const { cameraStatus, mentorUuid } = payload;
    videoMute[mentorUuid] = cameraStatus;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("video signal", {
          cameraStatus,
        });
      });
    }
  });

  socket.on("mentor mute status", (payload) => {
    const { mute, mentorUuid } = payload;
    mutedMentor[mentorUuid] = mute;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("mute signal", {
          mute,
        });
      });
    }
  });

  //mute end
  socket.on("end meeting", (payload) => {
    const { mentorUUid } = payload;
    // room[mentorId] = [];
    delete idToRoom[socket.id];
    delete roomToId[mentorUUid];
    delete mutedMentor[mentorUUid];
    delete videoMute[mentorUUid];
    delete schedule[mentorUUid];

    if (room[mentorUUid]) {
      room[mentorUUid].forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "connected host leave",
          "data"
        );
        delete studentIdToUuid[UuidToStudentId[studentUuid]];
        delete UuidToStudentId[studentUuid];
      });
      delete room[mentorUUid];
    }
  });
  socket.on("host take leave it clint side action", (payload) => {
    const { studentUuid } = payload;
    delete studentIdToUuid[socket.id];
    delete UuidToStudentId[studentUuid];
  });
  socket.on("student leave the meeting", (payload) => {
    const { studentId, mentorUuid } = payload;
    if (room[mentorUuid]) {
      const afterLeave = room[mentorUuid].filter((user) => user !== studentId);
      room[mentorUuid] = afterLeave;
      delete studentIdToUuid[socket.id];
      delete UuidToStudentId[studentId];
    }
  });
  //message
  socket.on("send message to student", (payload) => {
    const { tempMessage } = payload; //uuid, message
    if (room[tempMessage.uuid].length >= 1) {
      room[tempMessage.uuid].forEach((studentUuid) => {
        if (UuidToStudentId[studentUuid]) {
          io.to(UuidToStudentId[studentUuid]).emit("message receive", {
            tempMessage,
          });
        }
      });
    }
  });
  socket.on("send message to all", (payload) => {
    const { tempMessage, mentorUuid } = payload;

    if (room[mentorUuid]) {
      io.to(roomToId[mentorUuid]).emit("one of the student send message", {
        tempMessage,
      });
    }
  });
  socket.on("send to other", (payload) => {
    const { tempMessage, mentorUuid } = payload;
    if (room[mentorUuid].length > 1) {
      const exceptSender = room[mentorUuid].filter(
        (studentUuid) => studentUuid !== tempMessage.uuid
      );
      exceptSender.forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "all student get other student data",
          { tempMessage }
        );
      });
    }
  });
  //message end
  //record video start

  socket.on("record start", (payload) => {
    socket.emit("record", "data");
  });
  socket.on("stop record", (payload) => {
    socket.emit("record stop", "data");
  });
  //recording raw data
  socket.on("recording raw data", (payload) => {
    // console.log(payload);
  });
  //end Video

  //disconnect part
  socket.on("disconnect", () => {
    if (room[idToRoom[socket.id]]) {
      const mentorUid = idToRoom?.[socket.id];
      const roomTempData = room[mentorUid];
      //clear data from var
      // delete idToRoom[socket.id];
      // if i comment out then refresh will work
      // delete room[mentorUid];
      // delete roomToId[mentorUid];
      // delete mutedMentor[mentorUid];
      // delete videoMute[mentorUid];
      //may be it create issues
      roomTempData.forEach((user) => {
        const studentSocketId = UuidToStudentId?.[user];
        // console.log(studentSocketId);
        io.to(studentSocketId).emit("connected host leave", "data");
      });
      socket.broadcast.emit("send class already exit", {
        roomToId,
      });
    } else if (studentIdToUuid[socket.id]) {
      const studentIdUuid = studentIdToUuid[socket.id];
      const mentorUuid = studentConnectedTo[studentIdUuid];

      if (room[mentorUuid]) {
        const haveIn = room[mentorUuid].filter((id) => id !== studentIdUuid);
        room[mentorUuid] = haveIn;
      }
      delete UuidToStudentId[studentIdUuid];
      delete studentIdToUuid[socket.id];
      delete studentConnectedTo[studentIdUuid];
      io.to(roomToId[mentorUuid]).emit("one student leave", { studentIdUuid });
    }
  });
});

//for mail route

app.post("/mail", async (req, res) => {
  const { displayFromSideName, toEmail, body, subject, cc, bcc } = req.body;

  if (toEmail.length < 1)
    throw createError.BadRequest("You have to enter sender email... ");
  //mail property
  let transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "noreply.itqanuae@gmail.com",
      pass: "itqan@2021",
    },
  });
  //mail option
  const mailOption = {
    from: `${displayFromSideName} <foo@example.com>`,
    to: toEmail,
    subject: subject,
    text: body,
    cc,
    bcc,
  };
  const send = await transport.sendMail(mailOption);
  //mail option end
  //mail end
  res.send({ data: send });
});

//mail route
server.listen(process.env.PORT || 4000, () => {
  console.log("The port 4000 is ready to start....");
});
