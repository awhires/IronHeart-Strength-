import { useState } from "react";
import "./App.css";

function App() {
  const [form, setForm] = useState({
    name: "",
    activityLevel: "",
    height: "",
    weight: "",
  });

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    alert(`Welcome to IronHeart Strength, ${form.name}!`);
  }

  return (
    <div className="app">
      <div className="card">
        <img src="/logo.png" alt="IronHeart Strength logo" className="logo" />

        <h1>IronHeart Strength</h1>
        <p className="subtitle">Build your training profile</p>

        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input
            name="name"
            placeholder="Enter your name"
            value={form.name}
            onChange={handleChange}
          />

          <label>Activity Level</label>
          <select
            name="activityLevel"
            value={form.activityLevel}
            onChange={handleChange}
          >
            <option value="">Select activity level</option>
            <option value="beginner">Beginner</option>
            <option value="moderate">Moderate</option>
            <option value="advanced">Advanced</option>
            <option value="athlete">Athlete</option>
          </select>

          <label>Height</label>
          <input
            name="height"
            placeholder="Example: 5'9"
            value={form.height}
            onChange={handleChange}
          />

          <label>Weight</label>
          <input
            name="weight"
            placeholder="Example: 175 lbs"
            value={form.weight}
            onChange={handleChange}
          />

          <button type="submit">Continue</button>
        </form>
      </div>
    </div>
  );
}

export default App;
