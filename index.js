 var gifList = [
                "gifs/gif1.gif",
                "gifs/gif2.gif",
                "gifs/gif3.gif",
                "gifs/gif4.gif",
                "gifs/gif5.gif",
                "gifs/gif6.gif",]

                var rand = Math.floor(Math.random() * 6)
var element = document.getElementById("myGif");
element.src = gifList[rand]
console.log("yooo")
