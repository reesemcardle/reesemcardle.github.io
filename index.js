 var gifList = [
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif1.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif2.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif3.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif4.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif5.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif6.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif7.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif8.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif9.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif10.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif11.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif12.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif13.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif14.gif?raw=true",
                "https://github.com/reesemcardle/reesemcardle.github.io/blob/master/gifs/gif15.gif?raw=true"]

                var rand = Math.floor(Math.random() * 15)
var element = document.getElementById("myGif");
element.src = gifList[rand]
console.log("yooo")
