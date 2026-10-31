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
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

const width, height, scale = 480, 240, 2

var colors = color.Palette{
	color.RGBA{14, 18, 23, 255},    // background
	color.RGBA{37, 45, 55, 255},    // rules
	color.RGBA{219, 227, 235, 255}, // text
	color.RGBA{137, 154, 170, 255}, // previous thoughts
	color.RGBA{117, 220, 164, 255}, // cursor and prompt
	color.RGBA{226, 184, 112, 255}, // activity
}

type state struct {
	Tick      int       `json:"tick"`
	UpdatedAt time.Time `json:"updatedAt"`
	Snippet   *snippet  `json:"snippet"`
}

type snippet struct {
	Repository string   `json:"repository"`
	Path       string   `json:"path"`
	Commit     string   `json:"commit"`
	StartLine  int      `json:"startLine"`
	Lines      []string `json:"lines"`
}

type animator struct {
	gif        gif.GIF
	previous   *image.Paletted
	messages   []string
	activity   string
	clock      int
	wordOffset int
	source     string
	codeMode   bool
}

var thinkingWords = []string{
	"Combobulating", "Percolating", "Cogitating", "Ruminating",
	"Discombobulating", "Recombobulating", "Unfurling", "Bamboozling",
	"Puttering", "Marinating", "Scampering", "Conjuring",
	"Deslopping", "Adding slop",
}

func (a *animator) thinkingWord() string {
	if a.activity == "Deslopping" || a.activity == "Adding slop" {
		return a.activity
	}
	return thinkingWords[(a.clock/240+a.wordOffset)%len(thinkingWords)]
}

func (a *animator) bird(img *image.Paletted) {
	sprite := []string{
		"       gg       ",
		"      gggg      ",
		"      gwkg      ",
		"      ggggyy    ",
		"     gggggyyy   ",
		"    ggggggg     ",
		"   ggddgggg     ",
		"  ggddddggg     ",
		" gggddddgg      ",
		"ggg ggggg       ",
		"gg   ggg        ",
		"g     yy        ",
		"      y y       ",
	}
	x, y := 420, 7+(a.clock/60)%2
	blink := a.clock%400 >= 360
	for row, pixels := range sprite {
		for col, pixel := range pixels {
			var ink uint8
			switch pixel {
			case 'g':
				ink = 4
			case 'd':
				ink = 3
			case 'w':
				ink = 2
			case 'k':
				ink = 0
			case 'y':
				ink = 5
			default:
				continue
			}
			if blink && (pixel == 'w' || pixel == 'k') {
				ink = 1
			}
			draw.Draw(img, image.Rect(x+col*2, y+row*2, x+col*2+2, y+row*2+2), image.NewUniform(colors[ink]), image.Point{}, draw.Src)
		}
	}
}

func newAnimator() *animator {
	return &animator{
		gif:      gif.GIF{LoopCount: 0, Config: image.Config{ColorModel: colors, Width: width * scale, Height: height * scale}},
		activity: "Idling",
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
	text(img, 20, 27, "Agent:", 2)
	a.bird(img)
	draw.Draw(img, image.Rect(20, 43, 460, 44), image.NewUniform(colors[1]), image.Point{}, draw.Src)
	top, rows := 75, 7
	if a.codeMode {
		source := a.source
		if len(source) > 60 {
			source = source[:57] + "..."
		}
		text(img, 20, 63, source, 3)
		top, rows = 89, 6
	}
	var lines []string
	for i, message := range a.messages {
		if i > 0 && !a.codeMode {
			lines = append(lines, "")
		}
		lines = append(lines, wrap(strings.ReplaceAll(message, "\t", "    "))...)
	}
	if len(lines) > rows {
		lines = lines[len(lines)-rows:]
	}
	for i, line := range lines {
		ink := uint8(3)
		if a.codeMode || i == len(lines)-1 {
			ink = 2
		}
		text(img, 34, top+i*20, line, ink)
		if a.codeMode {
			trimmed := strings.TrimLeft(line, " ")
			for _, keyword := range []string{"func ", "return ", "if ", "for ", "switch ", "case "} {
				if strings.HasPrefix(trimmed, keyword) {
					text(img, 34+(len(line)-len(trimmed))*7, top+i*20, strings.TrimSpace(keyword), 4)
					break
				}
			}
		}
	}
	if len(lines) > 0 {
		y := top + (len(lines)-1)*20
		text(img, 20, y, ">", 4)
		if cursor {
			x := 35 + len(lines[len(lines)-1])*7
			draw.Draw(img, image.Rect(x, y-10, x+6, y+2), image.NewUniform(colors[4]), image.Point{}, draw.Src)
		}
	}
	text(img, 20, 221, string("|/-\\"[(a.clock/12)%4])+" "+a.thinkingWord()+"...", 5)
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
	a := newAnimator()
	a.wordOffset = s.Tick % len(thinkingWords)
	a.codeMode = true
	a.source = fmt.Sprintf("%s / %s:%d", filepath.Base(s.Snippet.Repository), filepath.Base(s.Snippet.Path), s.Snippet.StartLine)
	a.hold(60)
	for _, line := range s.Snippet.Lines {
		pause := 35
		if strings.TrimSpace(line) == "}" {
			pause = 90
		}
		a.typeMessage(line, "Reading", pause)
	}
	a.hold(1800)
	return &a.gif
}

func run(input string, output io.Writer) (int, error) {
	data, err := os.ReadFile(input)
	if err != nil {
		return 0, err
	}
	var s state
	if err := json.Unmarshal(data, &s); err != nil {
		return 0, err
	}
	if s.UpdatedAt.IsZero() {
		return 0, fmt.Errorf("missing scene timestamp")
	}
	if s.Tick < 0 {
		return 0, fmt.Errorf("invalid scene counter")
	}
	if s.Snippet == nil || len(s.Snippet.Lines) == 0 || len(s.Snippet.Lines) > 16 || s.Snippet.StartLine < 1 {
		return 0, fmt.Errorf("missing public code excerpt")
	}
	return s.Tick, gif.EncodeAll(output, animation(s))
}

func main() {
	input := flag.String("state", "../state.json", "NPC scene state")
	output := flag.String("out", "", "output image (default: terminal-<tick>.gif beside the state file)")
	flag.Parse()
	var encoded bytes.Buffer
	tick, err := run(*input, &encoded)
	if err == nil {
		if *output == "" {
			*output = filepath.Join(filepath.Dir(*input), fmt.Sprintf("terminal-%d.gif", tick))
		}
		err = os.WriteFile(*output, encoded.Bytes(), 0644)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
