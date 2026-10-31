package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

const width, height, scale = 480, 264, 2

var colors = color.Palette{
	color.RGBA{14, 18, 23, 255},    // background
	color.RGBA{37, 45, 55, 255},    // rules
	color.RGBA{219, 227, 235, 255}, // text
	color.RGBA{137, 154, 170, 255}, // previous thoughts
	color.RGBA{117, 220, 164, 255}, // cursor and prompt
	color.RGBA{226, 184, 112, 255}, // activity
}

type state struct {
	UpdatedAt time.Time `json:"updatedAt"`
	Snapshot  struct {
		LatestRepo string `json:"latestRepo"`
	} `json:"snapshot"`
}

type animator struct {
	gif      gif.GIF
	previous *image.Paletted
	messages []string
	activity string
	updated  string
	clock    int
}

func newAnimator(updated time.Time) *animator {
	return &animator{
		gif:      gif.GIF{LoopCount: 0, Config: image.Config{ColorModel: colors, Width: width * scale, Height: height * scale}},
		activity: "Digging",
		updated:  updated.UTC().Format("2006-01-02 15:04 UTC"),
	}
}

func text(img *image.Paletted, x, y int, value string, ink uint8) {
	d := font.Drawer{Dst: img, Src: image.NewUniform(colors[ink]), Face: basicfont.Face7x13, Dot: fixed.P(x, y)}
	d.DrawString(value)
}

func wrap(value string) []string {
	const columns = 60
	var lines []string
	for len(value) > columns {
		end := strings.LastIndex(value[:columns], " ")
		if end <= 0 {
			end = columns
		}
		lines = append(lines, value[:end])
		value = strings.TrimPrefix(value[end:], " ")
	}
	return append(lines, value)
}

func (a *animator) screen(cursor bool) *image.Paletted {
	img := image.NewPaletted(image.Rect(0, 0, width, height), colors)
	text(img, 20, 27, "jake / resident-agent", 2)
	text(img, 390, 27, "SIMULATED", 3)
	draw.Draw(img, image.Rect(20, 43, 460, 44), image.NewUniform(colors[1]), image.Point{}, draw.Src)
	var lines []string
	for i, message := range a.messages {
		if i > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, wrap(message)...)
	}
	if len(lines) > 7 {
		lines = lines[len(lines)-7:]
	}
	for i, line := range lines {
		ink := uint8(3)
		if i == len(lines)-1 {
			ink = 2
		}
		text(img, 34, 75+i*20, line, ink)
	}
	if len(lines) > 0 {
		y := 75 + (len(lines)-1)*20
		text(img, 20, y, ">", 4)
		if cursor {
			x := 35 + len(lines[len(lines)-1])*7
			draw.Draw(img, image.Rect(x, y-10, x+6, y+2), image.NewUniform(colors[4]), image.Point{}, draw.Src)
		}
	}
	text(img, 20, 221, string("|/-\\"[(a.clock/12)%4])+" "+a.activity+"...", 5)
	draw.Draw(img, image.Rect(20, 233, 460, 234), image.NewUniform(colors[1]), image.Point{}, draw.Src)
	text(img, 20, 252, "public poll: "+a.updated, 3)
	return img
}

// Keep only each changed rectangle. The GIF retains previous pixels, so typing
// does not require hundreds of full-size frames in memory or on the network.
func (a *animator) frame(delay int, cursor bool) {
	img := a.screen(cursor)
	bounds := img.Bounds()
	if a.previous != nil {
		bounds = image.Rectangle{}
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				if img.ColorIndexAt(x, y) != a.previous.ColorIndexAt(x, y) {
					bounds = bounds.Union(image.Rect(x, y, x+1, y+1))
				}
			}
		}
		if bounds.Empty() {
			a.gif.Delay[len(a.gif.Delay)-1] += delay
			a.clock += delay
			return
		}
	}
	frame := image.NewPaletted(image.Rect(bounds.Min.X*scale, bounds.Min.Y*scale, bounds.Max.X*scale, bounds.Max.Y*scale), colors)
	for y := frame.Rect.Min.Y; y < frame.Rect.Max.Y; y++ {
		for x := frame.Rect.Min.X; x < frame.Rect.Max.X; x++ {
			frame.SetColorIndex(x, y, img.ColorIndexAt(x/scale, y/scale))
		}
	}
	a.gif.Image = append(a.gif.Image, frame)
	a.gif.Delay = append(a.gif.Delay, delay)
	a.gif.Disposal = append(a.gif.Disposal, gif.DisposalNone)
	a.previous = img
	a.clock += delay
}

func (a *animator) hold(centiseconds int) {
	for centiseconds > 0 {
		delay := min(12, centiseconds)
		a.frame(delay, a.clock%100 < 55)
		centiseconds -= delay
	}
}

func (a *animator) typeMessage(value, activity string, pause int) {
	a.activity = activity
	a.messages = append(a.messages, "")
	i := len(a.messages) - 1
	for n := 2; n < len(value)+2; n += 2 {
		a.messages[i] = value[:min(n, len(value))]
		a.frame(6, true)
	}
	a.hold(pause)
}

func animation(s state) *gif.GIF {
	a := newAnimator(s.UpdatedAt)
	a.hold(60)
	a.typeMessage("oh, hey.", "Digging", 100)
	a.typeMessage("welcome to jake's profile.", "Digging", 120)
	a.typeMessage("i'm digging through the public activity feed.", "Digging", 140)
	if s.Snapshot.LatestRepo != "" {
		a.typeMessage("latest stop: "+s.Snapshot.LatestRepo, "Digging", 180)
	} else {
		a.typeMessage("quiet feed. i'll find something to overthink.", "Digging", 180)
	}
	a.typeMessage("combobulating what i found...", "Combobulating", 160)
	a.typeMessage("this should only take a second.", "Combobulating", 90)
	i := len(a.messages) - 1
	for len(a.messages[i]) > 0 {
		a.messages[i] = a.messages[i][:max(0, len(a.messages[i])-3)]
		a.frame(6, true)
	}
	a.messages = a.messages[:i]
	a.typeMessage("i have no useful estimate.", "Combobulating", 140)
	a.typeMessage("deslopping...", "Deslopping", 180)
	a.typeMessage("adding slop...", "Adding slop", 160)
	a.typeMessage("hang on. that undid the previous step.", "Adding slop", 180)
	a.typeMessage("have a look around. i'll keep digging.", "Digging", 480)
	return &a.gif
}

func run(input string, output io.Writer) error {
	data, err := os.ReadFile(input)
	if err != nil {
		return err
	}
	var s state
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s.UpdatedAt.IsZero() {
		return fmt.Errorf("missing public poll timestamp")
	}
	if repo := s.Snapshot.LatestRepo; repo != "" && !regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`).MatchString(repo) {
		return fmt.Errorf("invalid public repository name")
	}
	return gif.EncodeAll(output, animation(s))
}

func main() {
	input := flag.String("state", "../state.json", "public activity snapshot")
	output := flag.String("out", "../terminal.gif", "animated terminal image")
	flag.Parse()
	var encoded bytes.Buffer
	err := run(*input, &encoded)
	if err == nil {
		err = os.WriteFile(*output, encoded.Bytes(), 0644)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
