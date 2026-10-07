import os
from flask import Flask, render_template, jsonify

# Pydroid runs the editor code as "<string>", so Flask can't guess the folder.
# Find the folder that really contains templates/index.html.
def find_base():
    places = []
    try:
        places.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    places.append(os.getcwd())
    for p in places:
        if os.path.isfile(os.path.join(p, "templates", "index.html")):
            return p
    raise SystemExit("templates/index.html not found. Run app.py from inside the 'Graph system' folder. Looked in: " + ", ".join(places))

BASE = find_base()
app = Flask(__name__,
            template_folder=os.path.join(BASE, "templates"),
            static_folder=os.path.join(BASE, "static"))
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # always load the latest JS/CSS

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/path", methods=["POST"])
def path_api():
    # The browser performs the graph algorithms so the system stays simple.
    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(debug=False)
