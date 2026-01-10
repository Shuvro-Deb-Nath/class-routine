const timeSlots = [
  "08:45 AM –10:05 AM",
  "10:05 AM –11:25 AM",
  "11:25 AM –12:45 PM",
  "12:45 PM –01:15 PM",
  "01:15 PM –02:35 PM",
  "02:35 PM –03:55 PM"
];

fetch("/data/routine.yml")
  .then(res => res.text())
  .then(text => {
    const data = jsyaml.load(text);
    renderRoutine(data.days);
    highlightToday();
    checkCurrentClass();
    setInterval(checkCurrentClass, 60000);
  });

function renderRoutine(days) {
  const body = document.getElementById("routineBody");
  body.innerHTML = "";

  days.forEach(d => {
    const row = document.createElement("tr");
    row.dataset.day = d.day;
    row.innerHTML = `<td class="day">${d.day}</td>`;

    timeSlots.forEach(slot => {
      const cls = d.classes.find(c => c.time === slot);
      if (cls) {
        row.innerHTML += `
          <td class="${cls.code}" data-time="${slot}">
            <strong>${cls.subject}</strong><br>
            <small>${cls.room}</small>
          </td>
        `;
      } else {
        row.innerHTML += `<td></td>`;
      }
    });

    body.appendChild(row);
  });
}

function highlightToday() {
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  document.querySelectorAll("tr").forEach(row => {
    if (row.dataset.day === today) {
      row.classList.add("today-row");
    }
  });
}

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function checkCurrentClass() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  document.querySelectorAll("td[data-time]").forEach(cell => {
    cell.classList.remove("active-class");

    const [start, end] = cell.dataset.time.split("–");
    if (
      currentMinutes >= toMinutes(start) &&
      currentMinutes <= toMinutes(end)
    ) {
      cell.classList.add("active-class");
    }
  });
}
