import Anthropic from "@anthropic-ai/sdk";
import dayjs from "dayjs";

export function getCurrentDateTime({
  dateFormat = "dddd, MMMM DD, YYYY hh:mm:ss A",
}: {
  dateFormat?: string;
} = {}): string {
  if (!dateFormat) throw new Error("dateFormat can't be empty");
  return dayjs().format(dateFormat);
}

export const getCurrentDateTimeSchema: Anthropic.Tool = {
  name: "get_current_datetime",
  description:
    "Returns the current date and time formatted according to the specified format",
  input_schema: {
    type: "object",
    properties: {
      date_format: {
        type: "string",
        description:
          "A string specifying the format of the returned datetime. Uses dayjs format codes.",
        default: "dddd, MMMM DD, YYYY hh:mm:ss A",
      },
    },
    required: [],
  },
};

export function addDurationToDatetime(
  datetimeStr: string,
  duration: number = 0,
  unit: string = "days",
  inputFormat: string = "YYYY-MM-DD",
): string {
  const date = dayjs(datetimeStr, inputFormat).toDate();

  switch (unit) {
    case "seconds":
      date.setSeconds(date.getSeconds() + duration);
      break;
    case "minutes":
      date.setMinutes(date.getMinutes() + duration);
      break;
    case "hours":
      date.setHours(date.getHours() + duration);
      break;
    case "days":
      date.setDate(date.getDate() + duration);
      break;
    case "weeks":
      date.setDate(date.getDate() + duration * 7);
      break;
    case "months":
      date.setMonth(date.getMonth() + duration);
      break;
    case "years":
      date.setFullYear(date.getFullYear() + duration);
      break;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }

  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export const addDurationToDatetimeSchema: Anthropic.Tool = {
  name: "add_duration_to_datetime",
  description:
    "Adds a specified duration to a datetime string and returns the resulting datetime in a detailed format. This tool converts an input datetime string to a Javascript datetime object, adds the specified duration in the requested unit, and returns a formatted string of the resulting datetime. It handles various time units including seconds, minutes, hours, days, weeks, months, and years, with special handling for month and year calculations to account for varying month lengths and leap years. The output is always returned in a detailed format that includes the day of the week, month name, day, year, and time with AM/PM indicator (e.g., 'Thursday, April 03, 2025 10:30:00 AM').",
  input_schema: {
    type: "object",
    properties: {
      datetime_str: {
        type: "string",
        description:
          "The input datetime string to which the duration will be added. This should be formatted according to the input_format parameter.",
      },
      duration: {
        type: "number",
        description:
          "The amount of time to add to the datetime. Can be positive (for future dates) or negative (for past dates). Defaults to 0.",
      },
      unit: {
        type: "string",
        description:
          "The unit of time for the duration. Must be one of: 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', or 'years'. Defaults to 'days'.",
      },
      input_format: {
        type: "string",
        description:
          "The format string for parsing the input datetime_str, using dayjs format codes. For example, 'YYYY-MM-DD' for ISO format dates like '2025-04-03'. Defaults to 'YYYY-MM-DD'.",
      },
    },
    required: ["datetime_str"],
  },
};
