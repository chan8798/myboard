require('dotenv').config()
const express=require('express')
const app=express()
const bodyParser=require("body-parser")
const { ObjectId } = require('mongodb');
const fs = require('fs');
app.use(bodyParser.urlencoded({extended:true}))
app.set("view engine","ejs")
let session=require('express-session')
app.use(session({
  secret:'dkufe8938493j4e08349u',
  resave:false,
  saveUninitialized:true
}))

app.use('/image', express.static('public/image'));
const multer = require('multer');
const path = require('path');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/image'); 
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, basename + '-' + Date.now() + ext);
  }
});

const upload = multer({ storage: storage });
const mongoclient=require('mongodb').MongoClient
const DB_URL=process.env.DB_URL
let mydb
mongoclient.connect(DB_URL)
.then((client)=>{
  mydb=client.db('myboard')
})
app.listen(process.env.PORT,function(){
    console.log('포트 8080으로 서버대기중')
})

app.get('/',function(req,res){
  if(req.session.user){
    return res.redirect(`/home/${req.session.user.userid}`)
  }
  res.render("login.ejs")
})

app.get("/home/:userid", function(req, res) {
  const userid = req.params.userid;
  // 사용자 정보 가져오기
  mydb.collection("account").findOne({ userid: userid })
    .then((user) => {
      if (user) {
        // 친구 목록 가져오기
        mydb.collection("friend").findOne({ userId: userid })
          .then(friendDoc => {
            const friends = friendDoc ? friendDoc.friends : [];
            // 사용자 + 친구들의 게시물 가져오기
            const usersToFetch = [userid, ...friends];
            mydb.collection("blog").find({ userid: { $in: usersToFetch } }).sort({ createdAt: -1 }).toArray()
              .then(posts => {
                // 사용자 게시물과 친구 게시물을 분리
                const userPosts = posts.filter(post => post.userid === userid);
                const friendPosts = posts.filter(post => post.userid !== userid);
                // 친구들의 정보 가져오기
                mydb.collection("account").find({ userid: { $in: friends } }).toArray()
                  .then(friendDetails => {
                    // 친구 정보와 함께 게시물 렌더링
                    const friendInfoMap = friendDetails.reduce((acc, friend) => {
                      acc[friend.userid] = { name: friend.name, userid: friend.userid };
                      return acc;
                    }, {});
                    // 각 배열에서 최대 3개 게시물만 가져오기
                    const userRecentPosts = userPosts.slice(0, 3);
                    const friendRecentPosts = friendPosts.slice(0, 3);
                    res.render("home.ejs", {
                      user,
                      userRecentPosts,
                      friendRecentPosts,
                      friendInfoMap // 친구 정보 전달
                    });
                  });
              });
          });
      } else {
        res.send("사용자를 찾을 수 없습니다.");
      }
    });
});

app.get('/friend/:userid', async (req, res) => {
  const friendUserId = req.params.userid;
  if (!req.session.user) {
    return res.redirect('/');
  }
  try {
    // 친구의 계정 정보 조회
    const targetUser = await mydb.collection('account').findOne({ userid: friendUserId });
    if (!targetUser) {
      return res.status(404).send('해당 사용자를 찾을 수 없습니다.');
    }
    // friend 컬렉션에서 해당 사용자의 친구 리스트 가져오기
    const friendDoc = await mydb.collection('friend').findOne({ userId: friendUserId });
    if (friendDoc) {
      const friendIds = friendDoc.friends || [];
      const users = await mydb.collection('account')
        .find({ userid: { $in: friendIds } })
        .toArray();
     
      res.render('friendfriendlist.ejs', {
        user: req.session.user,
        friend: targetUser,           
        friends: users
      });
    } else {
      // 친구 정보가 없는 경우
      res.render('friendfriendlist.ejs', {
        user: req.session.user,
        friend: targetUser,           
        friends: []
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('서버 오류');
  }
});


app.get("/signup",function(req,res){
  res.render("signup.ejs", { message: null, messageType: null })
})
app.get("/logout",function(req,res){
  req.session.destroy()
  res.redirect("/")
})
app.get("/find",function(req,res){
  res.render("find.ejs",{result:null})
})
app.get("/write/:userid",function(req,res){
  const userid=req.params.userid
  mydb.collection("account").findOne({userid:userid})
    .then((user)=>{
      if (user){
        console.log(userid)
        res.render("write.ejs",{user})
      }
      else{
        res.send("사용자를 찾을 수 없습니다.")
      }
    })
})

app.get("/blog/:userid",function(req,res){
  const userid=req.params.userid;
  mydb.collection("account").findOne({userid:userid})
    .then((user)=>{
      if (user){
         mydb.collection("blog").find({ userid: userid })
         .sort({ createdAt: -1 }).toArray()
         .then((posts) => {
          res.render("myblog.ejs", { user, posts });
        })
      }
      else{
        res.send("사용자를 찾을 수 없습니다.")
      }
    })
})
app.get('/editpost/:id', (req, res) => {
  const postId = new ObjectId(req.params.id);
  mydb.collection('blog').findOne({ _id: postId })
    .then(post => {
      if (!post) return res.status(404).send("게시물 없음");
      mydb.collection('account').findOne({ userid: post.userid })
        .then(user => {
          if (!user) return res.status(404).send("사용자 없음");
          // 기존 게시물, 유저 정보와 함께 수정 폼 렌더링
          res.render('editpost.ejs', { post, user }); 
        });
    });
});


app.get('/friendblog/:userid', (req, res) => {
  const friendId = req.params.userid;
  if (!req.session.user) {
    return res.redirect('/');
  }
  mydb.collection("account").findOne({ userid: friendId })
    .then(friend => {
      if (!friend) return res.send("사용자를 찾을 수 없습니다.");
      mydb.collection("blog").find({ userid: friendId }).sort({ createdAt: -1 }).toArray()
        .then(posts => {
          // 여기에서 friend, posts, user 세 가지를 ejs로 전달
          res.render("friendblog.ejs", {
            friend,
            posts,
            user: req.session.user  // 로그인한 사용자 정보
          });
        });
    });
});

app.post("/login", function (req, res) {
  mydb.collection("account")
    .findOne({ userid: req.body.userid })
    .then((result) => {
      if (!result) {
         res.render("login.ejs", { noid: true, wrongpw: false });
      } else if (result.userpw == req.body.userpw) {
        req.session.user = result;  
        res.redirect(`/home/${result.userid}`);
      } else {
        res.render("login.ejs", { noid: false, wrongpw: true });
      }
    });
});


app.post("/find",function(req,res){
  const {name,email}=req.body
  mydb
  .collection("account")
  .findOne({name,email})
  .then((result)=>{
    if(!result){
      res.render("find.ejs",{result:null})
    }
    else{
      res.render("find.ejs",{result:result})
    }
  })
})

app.post("/signup",function(req,res){
  const {name,userid,userpw,email}=req.body
  mydb
  .collection("account")
  .findOne({
    $or:[
    {userid:userid},
    {email:email}
  ]
})
  .then((existingUser)=>{
    if(existingUser){
      return res.render("signup.ejs", {
        message: "아이디 또는 이메일이 이미 존재합니다.",
        messageType: "error"
      });
      /*res.send("아이디/이메일이 존재합니다.")*/
    }
    else{
      mydb.collection("account").insertOne({
      name,userid,userpw,email
      }).then(()=>{
              return res.render("signup.ejs", {
            message: "회원가입이 완료되었습니다.",
            messageType: "success"
          });
        /*res.send('회원가입완료')*/
      })
    }
  })
})

app.post('/savemongo', upload.single('image'), function(req,res){
  const {title,content,userid}=req.body
  createdAt=new Date()
  const imageFile = req.file
  let doc = { userid, title, content, createdAt }
  if(imageFile){
    doc.imagePath = '/image/'+imageFile.filename
  }
  mydb.collection("blog").insertOne(doc)
      .then(()=>{
        res.redirect(`/blog/${req.body.userid}`);
      }) 
})

app.post('/deletepost', function(req, res) {
  const postId = new ObjectId(req.body.postId);
  const userid = req.body.userid;
  // 1. 먼저 게시물 정보를 조회해서 이미지 경로를 가져옴
  mydb.collection("blog").findOne({ _id: postId })
    .then((post) => {
      if (!post) {
        return res.status(404).send("게시물을 찾을 수 없습니다.");
      }
      // 2. 이미지 파일 삭제 시도 (있는 경우만)
      if (post.imagePath) {
        // public/image/ 경로 기준으로 실제 경로 계산
        const imageFilePath = path.join(__dirname, 'public', post.imagePath.replace('/image/', 'image/'));
        fs.unlink(imageFilePath, (err) => {
          if (err) {
            console.warn("이미지 파일 삭제 실패 또는 존재하지 않음:", err.message);
          } else {
            console.log("이미지 파일 삭제 완료:", imageFilePath);
          }
        });
      }
      // 3. 게시물 자체 삭제
      return mydb.collection("blog").deleteOne({ _id: postId });
    })
    .then(() => {
      res.redirect('/blog/' + userid);
    })
    .catch((err) => {
      console.error("삭제 중 오류:", err);
      res.status(500).send("게시물 삭제 중 오류가 발생했습니다.");
    });
});

app.post('/editpost', upload.single('image'), (req, res) => {
  const { id, title, content, userid, deleteImage } = req.body;
  const postId = new ObjectId(id);
  const createdAt = new Date();

  mydb.collection('blog').findOne({ _id: postId }).then(post => {
    if (!post) return res.status(404).send('게시물 없음');
    const updateDoc = { title, content, userid, createdAt };
    // 1. 이미지 삭제 요청 처리
    if (deleteImage === 'true' && post.imagePath) {
      const filename = post.imagePath.split('/').pop();
      const filePath = path.join(__dirname, 'public', 'image', filename);
      fs.unlink(filePath, err => {
        if (err) console.error("이미지 삭제 실패:", err);
      });
      updateDoc.imagePath = null;
    }
    // 2. 새 이미지 업로드 시 기존 이미지 삭제
    if (req.file) {
      updateDoc.imagePath = '/image/' + req.file.filename;
    }
    // 3. 게시물 DB 업데이트
    mydb.collection('blog').updateOne({ _id: postId }, { $set: updateDoc })
      .then(() => {
        res.redirect('/blog/' + userid);
      });
  });
});

app.get('/searchfriend', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  const searchKeyword = req.query.username || '';
  const currentUserId = req.session.user.userid;
  try {
    const allUsers = await mydb.collection("account")
      .find({
        $and: [
          {
            $or: [
              { name: { $regex: searchKeyword, $options: 'i' } },
              { userid: { $regex: searchKeyword, $options: 'i' } }
            ]
          },
          { userid: { $ne: currentUserId } }
        ]
      })
      .toArray();
    const friendDoc = await mydb.collection("friend").findOne({ userId: currentUserId });
    const myFriends = friendDoc?.friends || [];
    // 각 유저에 대해 친구인지 여부 추가
    const usersWithStatus = allUsers.map(user => ({
      ...user,
      isFriend: myFriends.includes(user.userid)
    }));

    res.render('findfriend.ejs', {
      users: usersWithStatus,
      searchKeyword,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('서버 에러');
  }
});


// 친구 추가 라우트
app.post('/addfriend', async (req, res) => {
  const currentUserId = req.session.user?.userid;
  const friendId = req.body.friendId;
  const searchKeyword = req.body.searchKeyword || '';  
  if (!currentUserId || !friendId || currentUserId === friendId) {
    return res.redirect('/searchfriend?username=' + encodeURIComponent(searchKeyword));
  }
  try {
    const friendCollection = mydb.collection('friend');
    await friendCollection.updateOne(
      { userId: currentUserId },
      { $addToSet: { friends: friendId } },
      { upsert: true }
    );
    await friendCollection.updateOne(
      { userId: friendId },
      { $addToSet: { friends: currentUserId } },
      { upsert: true }
    );
    // 다시 검색어 유지한 상태로 리다이렉트
    res.redirect('/searchfriend?username=' + encodeURIComponent(searchKeyword));
  } catch (err) {
    console.error('친구 추가 실패:', err);
    res.status(500).send('친구 추가 중 오류 발생');
  }
});

app.get('/user/:userid/friends', (req, res) => {
  const userid = req.params.userid;
  const currentUserId = req.session.user.userid; // 현재 로그인한 사용자

  if (userid !== currentUserId) {
    return res.redirect(`/home/${currentUserId}`); // 본인 블로그로 리디렉션
  }

  mydb.collection('friend')
    .findOne({ userId: currentUserId })
    .then(friendDoc => {
      if (friendDoc) {
        const friendIds = friendDoc.friends || [];  // 친구의 userId 리스트

        // 친구의 userId들을 기반으로 사용자 정보를 가져옵니다.
        mydb.collection('account')  // 'account' 컬렉션에서 친구 정보 가져오기
          .find({ userid: { $in: friendIds } })
          .toArray()  // 배열로 변환
          .then(users => {
            console.log(users);  // 데이터가 잘 들어오는지 확인
            res.render('myfriendlist.ejs', { user: req.session.user, friends: users });
          })
          .catch(err => {
            console.error(err);
            res.status(500).send('서버 오류');
          });

      } else {
        res.render('myfriendlist.ejs', { user: req.session.user, friends: [] });
      }
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('서버 오류');
    });
});


app.post('/deletefriend', async (req, res) => {
  const currentUserId = req.session.user.userid;
  const friendId = req.body.friendId;

  if (!currentUserId || !friendId) {
    return res.status(400).send("잘못된 요청입니다.");
  }

  try {
    const friendCollection = mydb.collection('friend');

    // 서로 친구 관계에서 제거
    await friendCollection.updateOne(
      { userId: currentUserId },
      { $pull: { friends: friendId } }
    );
    await friendCollection.updateOne(
      { userId: friendId },
      { $pull: { friends: currentUserId } }
    );

    res.redirect('/user/' + currentUserId + '/friends');
  } catch (err) {
    console.error('친구 삭제 오류:', err);
    res.status(500).send('친구 삭제 중 오류 발생');
  }
});

app.get('/out/:userid', function (req, res) {
    const userId = req.session.user.userid;  // 세션에서 사용자 아이디 가져오기
    if (!userId) {
        return res.redirect('/');  // 로그인 안 된 경우 홈으로 리다이렉트
    }

    const accountCollection = mydb.collection('account');
    const blogCollection = mydb.collection('blog');
    const friendCollection = mydb.collection('friend');

    // 사용자의 블로그 게시물에서 이미지 경로를 가져와서 삭제
    blogCollection.find({ userid: userId }).toArray()
        .then(posts => {
            // 블로그 게시물 이미지 삭제
            posts.forEach(post => {
                if (post.imagePath) {
                    const filePath = path.join(__dirname, 'public', post.imagePath.replace('/image/', 'image/'));
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('블로그 이미지 파일 삭제 실패:', err);
                        } else {
                            console.log('블로그 이미지 파일 삭제 완료:', filePath);
                        }
                    });
                }
            });

            // 사용자의 블로그 게시물 삭제
            return blogCollection.deleteMany({ userid: userId });
        })
        .then(() => {
            // 사용자의 정보 삭제
            return accountCollection.deleteOne({ userid: userId });
        })
        .then(() => {
            // friend 컬렉션에서 사용자와 연결된 친구 목록에서 해당 사용자 ID 제거
            return friendCollection.updateMany(
                { friends: userId },  // 친구 목록에 userId가 포함된 문서
                { $pull: { friends: userId } }  // 해당 userId를 친구 목록에서 제거
            );
        })
        .then(() => {
            // friend 컬렉션에서 사용자 문서 삭제
            return friendCollection.deleteOne({ userId: userId });  // 사용자의 친구정보 삭제
        })
        .then(() => {
            // 세션 종료
            req.session.destroy(() => {
                // 삭제 후 홈 페이지로 리다이렉트
                res.redirect('/');
            });
        })
        .catch(err => {
            console.error('탈퇴 중 오류 발생:', err);
            res.status(500).send('탈퇴 중 오류가 발생했습니다.');
        });
});

