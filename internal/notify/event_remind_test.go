package notify

import "testing"

func TestFormatRemindOffset(t *testing.T) {
	cases := map[int]string{
		0:             "este momento",
		1:             "1 minuto",
		30:            "30 minutos",
		60:            "1 hora",
		120:           "2 horas",
		24 * 60:       "1 día",
		2 * 24 * 60:   "2 días",
		7 * 24 * 60:   "1 semana",
		14 * 24 * 60:  "2 semanas",
	}
	for minutes, want := range cases {
		if got := formatRemindOffset(minutes); got != want {
			t.Fatalf("formatRemindOffset(%d) = %q, want %q", minutes, got, want)
		}
	}
}

func TestEventRemindBody(t *testing.T) {
	got := eventRemindBody("Dentista", 30)
	want := "Dentista · en 30 minutos"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
