package main

import (
	"bytes"
	"image"
	"image/draw"
	"image/gif"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestAnimationRoundTrip(t *testing.T) {
	s := state{UpdatedAt: time.Date(2026, 10, 31, 22, 0, 0, 0, time.UTC)}
	s.Snapshot.LatestRepo = "JakeNesler/go"
	var encoded bytes.Buffer
	if err := gif.EncodeAll(&encoded, animation(s)); err != nil {
		t.Fatal(err)
	}
	if encoded.Len() > 2_000_000 {
		t.Fatalf("GIF too large for a profile panel: %d bytes", encoded.Len())
	}
	decoded, err := gif.DecodeAll(bytes.NewReader(encoded.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Config.Width != width*scale || decoded.Config.Height != height*scale || decoded.LoopCount != 0 {
		t.Fatalf("incorrect GIF dimensions or loop count: %+v", decoded.Config)
	}
	duration := 0
	for _, delay := range decoded.Delay {
		if delay < 2 {
			t.Fatal("frame delay risks browser timing clamping")
		}
		duration += delay
	}
	if duration < 2500 || duration > 6000 || len(decoded.Image) < 100 {
		t.Fatalf("expected a readable typing sequence; duration=%d frames=%d", duration, len(decoded.Image))
	}
	t.Logf("%d frames, %.1f seconds, %d bytes", len(decoded.Image), float64(duration)/100, encoded.Len())
}

func TestChangedRectanglesPreserveTypingAndBackspacing(t *testing.T) {
	a := newAnimator(time.Now())
	a.messages = []string{"hello there"}
	a.frame(6, true)
	a.messages[0] = "hello there visitor"
	a.frame(6, true)
	a.messages[0] = "hello"
	a.frame(6, true)
	if a.gif.Image[1].Rect.Dx() >= width*scale {
		t.Fatal("typing frame should only contain changed pixels")
	}
	canvas := image.NewRGBA(image.Rect(0, 0, width*scale, height*scale))
	for _, frame := range a.gif.Image {
		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Src)
	}
	for y := 0; y < height*scale; y++ {
		for x := 0; x < width*scale; x++ {
			if canvas.At(x, y) != a.previous.At(x/scale, y/scale) {
				t.Fatalf("incorrect composited pixel at %d,%d", x, y)
			}
		}
	}
}

func TestInvalidSnapshotsFailBeforeEncoding(t *testing.T) {
	for _, value := range []string{`{`, `{}`, `{"updatedAt":"bad"}`, `{"updatedAt":"2026-10-31T22:00:00Z","snapshot":{"latestRepo":"bad/name\nhello"}}`} {
		path := filepath.Join(t.TempDir(), "state.json")
		if err := os.WriteFile(path, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := run(path, &output); err == nil || output.Len() > 0 {
			t.Fatalf("invalid snapshot produced output: %s", value)
		}
	}
}

func TestLongRepositoryNamesFitThePanel(t *testing.T) {
	for _, line := range wrap("latest stop: owner/" + strings.Repeat("a", 100)) {
		if len(line) > 60 {
			t.Fatalf("line overflows the panel: %q", line)
		}
	}
}

func TestDialogueVariesButRerendersDeterministically(t *testing.T) {
	s := state{UpdatedAt: time.Date(2026, 10, 31, 22, 0, 0, 0, time.UTC)}
	if !reflect.DeepEqual(planDialogue(s), planDialogue(s)) {
		t.Fatal("rerendering one heartbeat changed its dialogue")
	}
	greetings := map[string]bool{}
	tangents := 0
	swallow := false
	for i := 0; i < 200; i++ {
		s.Tick = i
		d := planDialogue(s)
		greetings[d.Greeting] = true
		if len(d.Tangent) > 0 {
			tangents++
			swallow = swallow || strings.Contains(d.Tangent[0], "latent swallow")
		}
	}
	if len(greetings) < 2 || tangents == 0 || tangents == 200 || !swallow {
		t.Fatalf("missing variety: greetings=%d tangents=%d swallow=%v", len(greetings), tangents, swallow)
	}
}

func TestScrantonUsesLocalDayAndPartOfDay(t *testing.T) {
	for _, tc := range []struct{ utc, want string }{
		{"2026-10-31T22:00:00Z", "Saturday evening"},
		{"2026-06-01T01:00:00Z", "Sunday night"},
		{"2026-01-01T15:00:00Z", "Thursday morning"},
		{"2026-11-01T05:30:00Z", "Sunday night"},
		{"2026-11-01T06:30:00Z", "Sunday night"},
	} {
		at, err := time.Parse(time.RFC3339, tc.utc)
		if err != nil {
			t.Fatal(err)
		}
		if got := localPeriod(at); got != tc.want {
			t.Fatalf("%s: got %q, want %q", tc.utc, got, tc.want)
		}
	}
}

func TestWeatherReportsMissingAndStaleDataHonestly(t *testing.T) {
	s := state{}
	if !strings.Contains(weatherThought(s), "taking a moment") {
		t.Fatal("missing observation should be unavailable")
	}
	temp := 50.0
	s.Weather = &weather{ObservedAt: time.Date(2026, 10, 31, 22, 0, 0, 0, time.UTC), TemperatureF: &temp, Description: "Mostly Cloudy", Stale: true}
	got := weatherThought(s)
	if !strings.Contains(got, "feed unavailable") || !strings.Contains(got, "50 F, mostly cloudy") || !strings.Contains(got, "saturday evening") {
		t.Fatalf("incorrect stale report: %s", got)
	}
}
